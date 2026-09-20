from datetime import datetime, timezone
from shared import db, notify
from shared.db import now_iso


def lambda_handler(event, context):
    now = now_iso()
    table = db.table("REQUESTS_TABLE")

    stale = []
    last = None
    while True:
        kwargs = {
            "IndexName": "StatusIndex",
            "KeyConditionExpression": "#st = :st AND #ex < :now",
            "ExpressionAttributeNames": {"#st": "status", "#ex": "expires_at"},
            "ExpressionAttributeValues": {":st": "open", ":now": now},
            "ScanIndexForward": True,
            "Limit": 100,
        }
        if last:
            kwargs["ExclusiveStartKey"] = last
        resp = table.query(**kwargs)
        stale.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last or len(stale) >= 500:
            break

    updated = 0
    for item in stale:
        table.update_item(
            Key={"request_id": item["request_id"]},
            UpdateExpression="SET #st = :s, expired_at = :e, ttl = :ttl",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":s": "expired",
                ":e": now_iso(),
                ":ttl": int(datetime.now(timezone.utc).timestamp()) + 3600,
            },
        )
        notify.notify_requester(
            item.get("requester_phone"),
            f"[RAKTA] Your request for {item.get('blood_type')} in {item.get('city','').title()} "
            f"expired without a donor. Repost it, or ask the assistant for help. - RaktaSetu",
        )
        updated += 1

    print(f"expired={updated} total_checked={len(stale)}")
    return {"statusCode": 200, "body": "\\n".join([f"expired={updated}", f"checked={len(stale)}"])}