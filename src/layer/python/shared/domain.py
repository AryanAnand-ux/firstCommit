import uuid
from datetime import datetime, timedelta, timezone
from . import db, notify
from .validate import normalize_city, clean_phone, validate_blood_type

MAX_MATCHES = 20
URGENT_HOURS = 24
PLANNED_HOURS = 72


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def create_request(requester, payload, notify_people=True):
    blood_type = validate_blood_type(payload.get("blood_type"))
    city = normalize_city(payload.get("city"))
    phone = clean_phone(payload.get("phone"))
    if not blood_type:
        return None, {"validation": "blood_type must be one of A+, A-, B+, B-, AB+, AB-, O+, O-"}
    if not city:
        return None, {"validation": "city is required"}
    if not phone:
        return None, {"validation": "phone is required in E.164 format, e.g. +919876543210"}

    urgency = str(payload.get("urgency") or "planned").lower()
    if urgency not in db.URGENCIES:
        urgency = "planned"

    units = max(1, min(_to_int(payload.get("units"), 1), 4))

    requester_id = requester.get("sub", "")
    open_request = _existing_open_request(requester_id, blood_type, city)
    if open_request:
        return None, {
            "conflict": (
                f"You already have an open {blood_type} request in {city.title()}. "
                f"Fulfil or cancel it first, or let it expire."
            )
        }

    now = datetime.now(timezone.utc)
    hours = URGENT_HOURS if urgency == "urgent" else PLANNED_HOURS
    expires_at = now + timedelta(hours=hours)

    request_id = uuid.uuid4().hex
    username = str(payload.get("name") or "").strip() or requester.get("email", "") or "Requester"

    item = {
        "request_id": request_id,
        "requester_id": requester_id,
        "requester_email": requester.get("email", ""),
        "requester_name": username,
        "requester_phone": phone,
        "blood_type": blood_type,
        "city": city,
        "hospital": str(payload.get("hospital") or "").strip(),
        "note": str(payload.get("note") or "").strip(),
        "units": units,
        "urgency": urgency,
        "status": "open",
        "created_at": _iso(now),
        "expires_at": _iso(expires_at),
        "ttl": int(expires_at.timestamp()),
    }

    db.table("REQUESTS_TABLE").put_item(Item=item)
    _upsert_user(requester, str(payload.get("name") or "").strip(), phone)

    matched, alerted = [], 0
    if notify_people:
        matched, alerted = _match_and_alert(item)

    return item, {"matched": len(matched), "alerted": alerted}


def _existing_open_request(requester_id, blood_type, city):
    if not requester_id:
        return None
    table = db.table("REQUESTS_TABLE")
    resp = table.query(
        IndexName="RequesterIndex",
        KeyConditionExpression="#r = :r",
        ExpressionAttributeNames={"#r": "requester_id"},
        ExpressionAttributeValues={":r": requester_id},
        ScanIndexForward=False,
        Limit=10,
    )
    for item in resp.get("Items", []):
        if item.get("status") == "open" and item.get("blood_type") == blood_type and item.get("city") == city:
            return item
    return None


def _upsert_user(requester, name, phone):
    table = db.table("USERS_TABLE")
    user_id = requester.get("sub", "")
    if not user_id:
        return
    existing = table.get_item(Key={"user_id": user_id}).get("Item") or {}
    profile = {
        "user_id": user_id,
        "email": requester.get("email", "") or existing.get("email", ""),
        "name": name or existing.get("name") or requester.get("email", ""),
        "phone": phone,
        "is_donor": bool(existing.get("is_donor", False)),
    }
    profile = {k: v for k, v in profile.items() if v is not None}
    table.put_item(Item=profile)


def _match_and_alert(request_item):
    donors_table = db.table("DONORS_TABLE")
    city_key = request_item["city"] + "#"
    matched = []
    args = {
        "IndexName": "DonorMatchIndex",
        "KeyConditionExpression": "#bt = :bt AND begins_with(#mk, :ck)",
        "ExpressionAttributeNames": {"#bt": "blood_type", "#mk": "match_key", "#de": "donation_eligible", "#av": "available"},
        "ExpressionAttributeValues": {
            ":bt": request_item["blood_type"],
            ":ck": city_key,
            ":t": True,
        },
        "FilterExpression": "#de = :t AND #av = :t",
        "Limit": MAX_MATCHES,
    }
    resp = donors_table.query(**args)
    donors = resp.get("Items", [])

    matches_table = db.table("MATCHES_TABLE")
    now_iso = _iso(datetime.now(timezone.utc))
    alerted = 0
    for donor in donors[:MAX_MATCHES]:
        match_id = uuid.uuid4().hex
        match_item = {
            "match_id": match_id,
            "donor_id": donor["donor_id"],
            "donor_name": donor.get("name", ""),
            "donor_phone": donor.get("phone", ""),
            "blood_type": donor.get("blood_type", ""),
            "request_id": request_item["request_id"],
            "request_blood_type": request_item["blood_type"],
            "request_city": request_item["city"],
            "request_hospital": request_item.get("hospital", ""),
            "request_note": request_item.get("note", ""),
            "requester_name": request_item.get("requester_name", ""),
            "requester_phone": request_item.get("requester_phone", ""),
            "urgency": request_item.get("urgency", "planned"),
            "status": "sent",
            "created_at": now_iso,
        }
        matches_table.put_item(Item=match_item)
        matched.append(match_item)

    for donor in matched:
        ok = notify.notify_donor(
            donor,
            f"[RAKTA] {request_item['blood_type']} needed in {request_item['city'].title()} "
            f"({'URGENT' if request_item['urgency']=='urgent' else 'planned'}, {request_item['units']} unit(s)). "
            f"Hospital: {request_item.get('hospital') or 'n/a'}. Contact {request_item['requester_name']} "
            f"at {request_item['requester_phone']}. Reply in app under My Alerts.",
        )
        alerted += 1 if ok else 0

    notify.notify_requester(
        request_item["requester_phone"],
        f"[RAKTA] Your request ({request_item['blood_type']}, {request_item['city'].title()}) is live. "
        f"{len(matched)} matching donor(s) alerted. Track it in the app.",
    )
    return matched, alerted


def public_request(item):
    keys = [
        "request_id", "blood_type", "city", "hospital", "note", "units",
        "urgency", "status", "created_at", "expires_at",
        "requester_name", "requester_phone",
    ]
    return {k: item.get(k) for k in keys}


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default