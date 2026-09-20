import json
from shared.api import ok, bad_request, identity
from shared.validate import parse_body


def lambda_handler(event, context):
    body = parse_body(event)
    requester = identity(event)
    if not requester["sub"]:
        return bad_request("Sign in to post a request")

    from shared.domain import create_request

    item, issues = create_request(requester, body)
    if item is None:
        return bad_request(issues.get("validation", "Invalid request"))

    return ok(
        {
            "request": _public_request(item),
            "matches": issues.get("matched", 0),
            "sms_alerted": issues.get("alerted", 0),
        }
    )


def _public_request(item):
    keys = [
        "request_id", "blood_type", "city", "hospital", "note", "units",
        "urgency", "status", "created_at", "expires_at",
        "requester_name", "requester_phone",
    ]
    return {k: item.get(k) for k in keys}