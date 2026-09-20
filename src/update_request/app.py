import uuid
from shared.api import ok, bad_request, not_found, forbidden, identity
from shared import db, notify
from shared.validate import parse_body
from shared.db import now_iso


def lambda_handler(event, context):
    requester = identity(event)
    request_id = event.get("pathParameters", {}).get("id")
    if not request_id:
        return bad_request("Missing request id")

    body = parse_body(event)
    action = str(body.get("action") or "").lower()
    if action not in {"fulfill", "cancel"}:
        return bad_request("action must be 'fulfill' or 'cancel'")

    table = db.table("REQUESTS_TABLE")
    try:
        item = table.get_item(Key={"request_id": request_id}).get("Item")
    except Exception:
        return error_500()
    if not item:
        return not_found("Request not found")
    if item.get("requester_id") != requester["sub"]:
        return forbidden("Only the requester can update this request")

    new_status = "fulfilled" if action == "fulfill" else "cancelled"
    table.update_item(
        Key={"request_id": request_id},
        UpdateExpression="SET #st = :s, updated_at = :u",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": new_status, ":u": now_iso()},
    )
    item["status"] = new_status

    notified = _notify_matches(item, action)
    return ok({"request_id": request_id, "status": new_status, "donors_notified": notified})


def _notify_matches(item, action):
    matches_table = db.table("MATCHES_TABLE")
    resp = matches_table.query(
        IndexName="RequestIndex",
        KeyConditionExpression="#r = :r",
        ExpressionAttributeNames={"#r": "request_id"},
        ExpressionAttributeValues={":r": item["request_id"]},
    )
    sent = [m for m in resp.get("Items", []) if m.get("status") == "sent"]

    if action == "fulfill":
        message = (
            f"[RAKTA] The request for {item['blood_type']} in {item.get('city','').title()} "
            f"has been fulfilled. Thank you for responding. - RaktaSetu"
        )
    else:
        message = (
            f"[RAKTA] The request for {item['blood_type']} in {item.get('city','').title()} "
            f"was cancelled by the requester. Thanks for your help. - RaktaSetu"
        )
        for m in sent:
            matches_table.update_item(
                Key={"match_id": m["match_id"]},
                UpdateExpression="SET #st = :s",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":s": "cancelled"},
            )

    count = 0
    for m in sent:
        count += 1 if notify.send_sms(m.get("donor_phone"), message) else 0
    return count


def error_500():
    from shared.api import error
    return error(500, "internal_error", "Something went wrong")