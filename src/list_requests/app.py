import json
from shared.api import ok
from shared import db


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    status = params.get("status", "open")
    blood_type = (params.get("bloodType") or "").strip().upper()
    city = " ".join((params.get("city") or "").lower().split())

    count = 50
    try:
        count = max(1, min(int(params.get("limit") or 50), 100))
    except (TypeError, ValueError):
        pass

    items = _query_status(status)
    items.sort(key=lambda i: i.get("created_at", ""), reverse=True)

    if blood_type:
        items = [i for i in items if i.get("blood_type") == blood_type]
    if city:
        items = [i for i in items if i.get("city") == city]

    public = [_public(i) for i in items[:count]]
    return ok({"status": status, "count": len(public), "requests": public})


def _query_status(status):
    table = db.table("REQUESTS_TABLE")
    items = []
    last = None
    resp = table.query(
        IndexName="StatusIndex",
        KeyConditionExpression="#st = :st",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":st": status},
        ScanIndexForward=False,
        Limit=100,
    )
    items.extend(resp.get("Items", []))
    last = resp.get("LastEvaluatedKey")
    while last and len(items) < 100:
        resp = table.query(
            IndexName="StatusIndex",
            KeyConditionExpression="#st = :st",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={":st": status},
            ScanIndexForward=False,
            ExclusiveStartKey=last,
        )
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
    return items


def _public(item):
    keys = [
        "request_id", "blood_type", "city", "hospital", "note", "units",
        "urgency", "status", "created_at", "expires_at",
        "requester_name", "requester_phone", "confirmed_count", "declined_count",
    ]
    return {k: (item.get(k) if item.get(k) is not None else 0) if k in ("confirmed_count", "declined_count") else item.get(k) for k in keys}