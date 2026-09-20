import json


def ok(data=None):
    return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps(data if data is not None else {})}


def created(data=None):
    return {"statusCode": 201, "headers": {"Content-Type": "application/json"}, "body": json.dumps(data if data is not None else {})}


def bad_request(message, data=None):
    return error(400, "bad_request", message, data)


def conflict(message, data=None):
    return error(409, "conflict", message, data)


def forbidden(message="Not allowed"):
    return error(403, "forbidden", message)


def not_found(message="Not found"):
    return error(404, "not_found", message)


def error(status, code, message, data=None):
    body = {"code": code, "message": message}
    if data is not None:
        body["data"] = data
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def identity(event):
    claims = (event.get("requestContext") or {}).get("authorizer", {}).get("claims") or {}
    return {
        "sub": claims.get("sub") or "",
        "email": claims.get("email") or "",
        "is_donor": (claims.get("custom:isDonor") or "0") == "1",
    }