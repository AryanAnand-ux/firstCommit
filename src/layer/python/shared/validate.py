import re
import json
from .db import BLOOD_TYPES, URGENCIES

PHONE_RE = re.compile(r"^\+\d{10,15}$")


def normalize_city(value):
    if not value:
        return None
    return " ".join(str(value).strip().lower().split()) or None


def clean_phone(value):
    if not value:
        return None
    value = str(value).replace(" ", "").replace("-", "")
    if not value.startswith("+"):
        value = "+" + value
    if PHONE_RE.match(value):
        return value
    return None


def validate_blood_type(value):
    value = str(value or "").strip().upper()
    return value if value in BLOOD_TYPES else None


def validate_urgency(value):
    value = str(value or "planned").strip().lower()
    return value if value in URGENCIES else "planned"


def ensure_units(value):
    try:
        units = int(value or 1)
    except (TypeError, ValueError):
        units = 1
    return max(1, min(units, 4))


def parse_body(event):
    if not event.get("body"):
        return {}
    try:
        return json.loads(event["body"])
    except (TypeError, ValueError):
        return {}