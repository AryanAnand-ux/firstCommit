from shared.api import ok, bad_request, conflict, identity
from shared.validate import parse_body


def lambda_handler(event, context):
    body = parse_body(event)
    requester = identity(event)
    if not requester["sub"]:
        return bad_request("Sign in to post a request")

    from shared.domain import create_request, public_request

    item, issues = create_request(requester, body)
    if item is None:
        if issues.get("conflict"):
            return conflict(issues["conflict"])
        return bad_request(issues.get("validation", "Invalid request"))

    return ok(
        {
            "request": public_request(item),
            "matches": issues.get("matched", 0),
            "sms_alerted": issues.get("alerted", 0),
        }
    )