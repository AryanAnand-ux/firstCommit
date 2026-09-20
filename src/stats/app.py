from shared.api import ok, bad_request
from shared import db
from shared.domain import donation_eligible


def lambda_handler(event, context):
    requests = _scan_all("REQUESTS_TABLE")
    donors = _scan_all("DONORS_TABLE")

    totals = {"total": len(requests), "open": 0, "fulfilled": 0, "cancelled": 0, "expired": 0}
    by_blood = {}
    by_city = {}
    for r in requests:
        totals[r.get("status", "open")] = totals.get(r.get("status", "open"), 0) + 1
        if r.get("status") == "open":
            bt = r.get("blood_type", "unknown")
            by_blood[bt] = by_blood.get(bt, 0) + 1
            city = r.get("city", "unknown")
            by_city[city] = by_city.get(city, 0) + 1

    donor_by_blood = {}
    donors_ready = 0
    for d in donors:
        bt = d.get("blood_type", "unknown")
        donor_by_blood[bt] = donor_by_blood.get(bt, 0) + 1
        if d.get("available") and donation_eligible(d.get("last_donation")):
            donors_ready += 1

    return ok(
        {
            "generated_at": _now(),
            "requests": totals,
            "requests_open_by_blood_type": by_blood,
            "requests_open_by_city": by_city,
            "donors_total": len(donors),
            "donors_ready": donors_ready,
            "donors_by_blood_type": donor_by_blood,
        }
    )


def _scan_all(table_env):
    out = []
    last = None
    t = db.table(table_env)
    while True:
        kwargs = {"Limit": 100}
        if last:
            kwargs["ExclusiveStartKey"] = last
        resp = t.scan(**kwargs)
        out.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
    return out


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")