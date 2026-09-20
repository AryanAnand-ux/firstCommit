from shared.api import ok, bad_request, identity
from shared import db


def lambda_handler(event, context):
    user = identity(event)
    if not user["sub"]:
        return bad_request("Sign in first")

    params = event.get("queryStringParameters") or {}
    status = str(params.get("status") or "").lower()

    table = db.table("MATCHES_TABLE")
    items = []
    last = None
    while True:
        kwargs = {
            "IndexName": "DonorIndex",
            "KeyConditionExpression": "#d = :d",
            "ExpressionAttributeNames": {"#d": "donor_id"},
            "ExpressionAttributeValues": {":d": user["sub"]},
            "ScanIndexForward": False,
            "Limit": 50,
        }
        if last:
            kwargs["ExclusiveStartKey"] = last
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last or len(items) >= 200:
            break

    if status:
        items = [i for i in items if i.get("status") == status]

    return ok({"count": len(items), "matches": [_public(i) for i in items]})


def _public(item):
    keys = [
        "match_id", "donor_id", "donor_name", "donor_phone", "blood_type",
        "request_id", "request_blood_type", "request_city", "request_hospital",
        "request_note", "requester_name", "requester_phone", "urgency", "status", "created_at",
    ]
    return {k: item.get(k) for k in keys}