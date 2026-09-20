from shared.api import ok, bad_request, not_found, forbidden, conflict, identity
from shared import db, notify
from shared.validate import parse_body
from shared.db import now_iso


def lambda_handler(event, context):
    user = identity(event)
    match_id = event.get("pathParameters", {}).get("id")
    if not match_id:
        return bad_request("Missing match id")

    body = parse_body(event)
    action = str(body.get("action") or "").lower()
    if action not in {"confirm", "decline"}:
        return bad_request("action must be 'confirm' or 'decline'")

    table = db.table("MATCHES_TABLE")
    item = table.get_item(Key={"match_id": match_id}).get("Item")
    if not item:
        return not_found("Match not found")
    if item.get("donor_id") != user["sub"]:
        return forbidden("Only the matched donor can respond")

    new_status = "confirmed" if action == "confirm" else "declined"
    current = item.get("status")

    if current in {"confirmed", "declined"}:
        if current == new_status:
            return ok({"status": new_status, "match": _public(item)})
        return conflict(f"You already responded to this alert as {current}.")

    if action == "confirm":
        request_table = db.table("REQUESTS_TABLE")
        request = request_table.get_item(Key={"request_id": item.get("request_id")}).get("Item")
        if not request or request.get("status") != "open":
            return conflict("This request is no longer active, so your confirmation is closed.")

    table.update_item(
        Key={"match_id": match_id},
        UpdateExpression="SET #st = :s, responded_at = :r",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": new_status, ":r": now_iso()},
    )
    item["status"] = new_status

    if action == "confirm":
        notify.notify_requester(
            item.get("requester_phone"),
            f"[RAKTA] {item.get('donor_name','A donor')} ({item.get('donor_phone','')}) confirmed "
            f"your {item.get('request_blood_type')} request in {item.get('request_city','').title()}. "
            f"Reach them now. - RaktaSetu",
        )

    return ok({"status": new_status, "match": _public(item)})


def _public(item):
    keys = ["match_id", "donor_name", "donor_phone", "request_blood_type", "request_city", "request_hospital", "requester_name", "requester_phone", "status", "created_at"]
    return {k: item.get(k) for k in keys}