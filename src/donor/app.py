import json
from datetime import datetime, timezone
from shared.api import ok, bad_request, identity
from shared import db
from shared.validate import parse_body, clean_phone, normalize_city, BLOOD_TYPES


def lambda_handler(event, context):
    requester = identity(event)
    if not requester["sub"]:
        return bad_request("Sign in first")

    if event["httpMethod"] == "GET":
        return _get(requester)
    return _put(requester, parse_body(event))


def _get(user):
    item = db.table("DONORS_TABLE").get_item(Key={"donor_id": user["sub"]}).get("Item")
    if not item:
        item = {"donor_id": user["sub"], "email": user["email"], "is_donor": False}
    return ok(_public(item))


def _put(user, body):
    blood_type = str(body.get("blood_type") or "").strip().upper()
    if blood_type not in BLOOD_TYPES:
        return bad_request(f"blood_type must be one of {', '.join(BLOOD_TYPES)}")

    city = normalize_city(body.get("city"))
    if not city:
        return bad_request("city is required")

    phone = clean_phone(body.get("phone"))
    if not phone:
        return bad_request("phone is required in E.164 format, e.g. +919876543210")

    name = str(body.get("name") or "").strip() or user.get("email", "Donor")
    last_donation = str(body.get("last_donation") or "").strip()
    available = bool(body.get("available", True))

    eligible = _donation_eligible(last_donation)

    db.table("DONORS_TABLE").put_item(
        Item={
            "donor_id": user["sub"],
            "email": user.get("email", ""),
            "name": name,
            "phone": phone,
            "blood_type": blood_type,
            "city": city,
            "last_donation": last_donation,
            "donation_eligible": eligible,
            "available": available,
            "match_key": f"{city}#{user['sub']}",
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
    )

    db.table("USERS_TABLE").put_item(
        Item={"user_id": user["sub"], "email": user.get("email", ""), "name": name, "phone": phone, "is_donor": True}
    )

    return ok(_public({"donor_id": user["sub"], "name": name, "phone": phone, "blood_type": blood_type, "city": city, "donation_eligible": eligible, "available": available, "is_donor": True}))


def _donation_eligible(last_donation):
    if not last_donation:
        return True
    try:
        last = datetime.fromisoformat(last_donation.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return True
    months_ago = (datetime.now(timezone.utc).replace(tzinfo=None) - last).days / 30.0
    return months_ago >= 3


def _public(item):
    keys = ["donor_id", "name", "phone", "blood_type", "city", "last_donation", "donation_eligible", "available", "email", "is_donor"]
    return {k: item.get(k) for k in keys if k in item or k in ("is_donor", "donation_eligible", "available")}