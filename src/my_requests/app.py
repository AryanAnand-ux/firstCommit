from shared.api import ok, bad_request, identity
from shared import db
from shared.domain import public_request


def lambda_handler(event, context):
    user = identity(event)
    if not user["sub"]:
        return bad_request("Sign in first")

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
        if not last or len(items) >= 200:
            break

    return ok({"count": len(items), "requests": [public_request(i) for i in items]})