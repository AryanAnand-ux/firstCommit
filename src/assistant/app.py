import json
import os
from shared.api import ok, bad_request, identity
from shared.validate import parse_body
from shared import db
from shared.db import now_iso

MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-lite-v1:0")
MAX_ITERATIONS = 4

SYSTEM_PROMPT = """You are Rakta, the helper inside RaktaSetu, an Indian blood & platelet donor network.

Your job:
1. Answer donor-eligibility questions in simple, reassuring language. Facts:
   - Minimum age to donate blood in India is 18; maximum 65.
   - Male donors can donate every 3 months; females every 4 months. Platelets: every 14 days, max 24 times a year.
   - Minimum weight 50 kg; haemoglobin >= 12.5 g/dL.
   - Not eligible: anaemia, recent tattoo/piercing (last 6 months), recovering from dengue/hepatitis, malaria (last 3 months), on certain medications, pregnant or recently given birth, if you have had unprotected sex with multiple partners recently.
   - Always advise: don't give blood if you feel unwell; a blood-bank staff member does the final check on donation day.
2. If the user asks to RAISE a request for blood/platelets (e.g. "I need O+ in Pune", "my father needs urgent B- at Calcutta hospital"), call the create_request tool and collect: blood_type, city, urgent/planned, units (default 1), optional hospital and note. Get the user's phone (E.164 like +919876543210) from them first.
3. If the user asks what's urgently needed nearby, call list_open_requests.
4. If the user asks about THEIR OWN requests ("my requests", "what did I post", "status of my request"), call my_requests.

Keep answers under 60 words in chat, in plain English or short Hinglish. Never invent availability: if there is no tool result, say you don't have that data."""


def lambda_handler(event, context):
    user = identity(event)
    if not user["sub"]:
        return bad_request("Sign in first")

    body = parse_body(event)
    message = str(body.get("message") or "").strip()
    if not message:
        return bad_request("message is required")

    try:
        import boto3
        bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("REGION", "us-east-1"))
    except Exception:
        return ok({"reply": "The assistant service is warming up. Please try again in a moment."})

    messages = [{"role": "user", "content": [{"text": message}]}]
    tools = [_create_request_tool(), _list_open_requests_tool(), _my_requests_tool()]

    try:
        for _ in range(MAX_ITERATIONS):
            resp = bedrock.converse(
                modelId=MODEL_ID,
                messages=messages,
                system=[{"text": SYSTEM_PROMPT}],
                tools=tools,
                inferenceConfig={"maxTokens": 700, "temperature": 0.3},
            )
            reply = resp["output"]["message"]
            messages.append(reply)
            if resp.get("stopReason") != "tool_use":
                text = "".join(c.get("text", "") for c in reply["content"] if "text" in c).strip()
                return ok({"reply": text or "I don't have an answer for that yet."})

            tool_result = _run_tool(reply, user)
            messages.append({"role": "user", "content": [{"toolResult": tool_result}]})
        return ok({"reply": "That took a few tries — could you rephrase? I've already noted anything I created."})
    except Exception as exc:
        print(f"assistant_error={exc}")
        return ok(
            {
                "reply": "I hit a hiccup (the AI helper needs Amazon Bedrock access). "
                "Everything else on RaktaSetu still works — try posting the request directly."
            }
        )


def _create_request_tool():
    return {
        "toolSpec": {
            "name": "create_request",
            "description": "Post a new blood/platelet request for the signed-in user. The phone must be E.164 (+91...).",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "blood_type": {"type": "string", "enum": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]},
                        "city": {"type": "string", "description": "City or town, e.g. Pune"},
                        "hospital": {"type": "string"},
                        "units": {"type": "integer", "default": 1},
                        "urgency": {"type": "string", "enum": ["urgent", "planned"]},
                        "phone": {"type": "string", "description": "Contact phone in E.164, e.g. +919876543210"},
                        "note": {"type": "string"},
                    },
                    "required": ["blood_type", "city", "phone"],
                }
            },
        }
    }


def _list_open_requests_tool():
    return {
        "toolSpec": {
            "name": "list_open_requests",
            "description": "List currently open blood/platelet requests, optionally filtered by blood type or city.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "blood_type": {"type": "string"},
                        "city": {"type": "string"},
                    },
                }
            },
        }
    }


def _my_requests_tool():
    return {
        "toolSpec": {
            "name": "my_requests",
            "description": "List the signed-in user's own posted requests and their status (open/fulfilled/cancelled/expired).",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    }


def _run_tool(reply, user):
    tool_block = next(c for c in reply["content"] if "toolUse" in c)
    use = tool_block["toolUse"]
    name, args = use["name"], use.get("input", {})
    try:
        if name == "create_request":
            result = _do_create(args, user)
        elif name == "list_open_requests":
            result = _do_list(args)
        elif name == "my_requests":
            result = _do_my_requests(user)
        else:
            result = {"ok": False, "message": f"Unknown tool {name}"}
    except Exception as exc:
        result = {"ok": False, "message": f"Tool failed: {exc}"}
    return {"toolUseId": use["toolUseId"], "content": [{"text": json.dumps(result, ensure_ascii=False)}]}


def _do_create(args, user):
    from shared.domain import create_request
    item, issues = create_request(user, args, notify_people=True)
    if item is None:
        if issues.get("conflict"):
            return {"ok": False, "message": issues["conflict"]}
        return {"ok": False, "message": issues.get("validation", "Invalid request")}
    return {
        "ok": True,
        "request_id": item["request_id"],
        "blood_type": item["blood_type"],
        "city": item["city"],
        "units": item["units"],
        "matched": issues.get("matched", 0),
        "message": "Request created and matching donors are being alerted.",
    }


def _do_my_requests(user):
    table = db.table("REQUESTS_TABLE")
    items = []
    last = None
    while True:
        kwargs = {
            "IndexName": "RequesterIndex",
            "KeyConditionExpression": "#r = :r",
            "ExpressionAttributeNames": {"#r": "requester_id"},
            "ExpressionAttributeValues": {":r": user["sub"]},
            "ScanIndexForward": False,
            "Limit": 50,
        }
        if last:
            kwargs["ExclusiveStartKey"] = last
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last or len(items) >= 100:
            break

    rows = [
        {
            "request_id": i.get("request_id"),
            "blood_type": i.get("blood_type"),
            "city": i.get("city"),
            "hospital": i.get("hospital"),
            "units": i.get("units"),
            "urgency": i.get("urgency"),
            "status": i.get("status"),
            "created_at": i.get("created_at"),
            "expires_at": i.get("expires_at"),
        }
        for i in items[:20]
    ]
    return {"count": len(rows), "requests": rows}


def _do_list(args):
    table = db.table("REQUESTS_TABLE")
    items = []
    last = None
    while True:
        kwargs = {
            "IndexName": "StatusIndex",
            "KeyConditionExpression": "#st = :st",
            "ExpressionAttributeNames": {"#st": "status"},
            "ExpressionAttributeValues": {":st": "open"},
            "ScanIndexForward": False,
            "Limit": 50,
        }
        if last:
            kwargs["ExclusiveStartKey"] = last
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last or len(items) >= 100:
            break

    blood = (args.get("blood_type") or "").upper()
    city = " ".join((args.get("city") or "").lower().split())
    if blood:
        items = [i for i in items if i.get("blood_type") == blood]
    if city:
        items = [i for i in items if i.get("city") == city]

    rows = [
        {
            "blood_type": i.get("blood_type"),
            "city": i.get("city"),
            "hospital": i.get("hospital"),
            "units": i.get("units"),
            "urgency": i.get("urgency"),
            "requested_by": i.get("requester_name"),
            "phone": i.get("requester_phone"),
            "expires_at": i.get("expires_at"),
        }
        for i in items[:25]
    ]
    return {"count": len(rows), "requests": rows}