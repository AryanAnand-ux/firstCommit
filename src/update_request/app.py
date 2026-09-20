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
    matches = resp.get("Items", [])
    sent = [m for m in matches if m.get("status") == "sent"]
    confirmed = [m for m in matches if m.get("status") == "confirmed"]

    if action == "fulfill":
        for m in confirmed:
            notify.notify_donor(
                m,
                f"[RAKTA] Great news — the {item['blood_type']} request in {item.get('city','').title()} "
                f"is ready. Reach {item.get('requester_name','the requester')} at {item.get('requester_phone')} now. - RaktaSetu",
            )
        for m in sent:
            matches_table.update_item(
                Key={"match_id": m["match_id"]},
                UpdateExpression="SET #st = :s",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":s": "cancelled"},
            )
            notify.send_sms(
                m.get("donor_phone"),
                f"[RAKTA] The {item['blood_type']} request in {item.get('city','').title()} has been fulfilled "
                f"by another donor. Thank you for offering help. - RaktaSetu",
            )
        return len(confirmed) + len(sent)

    for m in sent + confirmed:
        matches_table.update_item(
            Key={"match_id": m["match_id"]},
            UpdateExpression="SET #st = :s",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={":s": "cancelled"},
        )
        notify.send_sms(
            m.get("donor_phone"),
            f"[RAKTA] The request for {item['blood_type']} in {item.get('city','').title()} was cancelled "
            f"by the requester. Thanks for your help. - RaktaSetu",
        )
    return len(sent) + len(confirmed)


def error_500():
    from shared.api import error
    return error(500, "internal_error", "Something went wrong")