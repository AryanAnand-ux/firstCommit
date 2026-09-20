#!/usr/bin/env python3
"""Pure-logic tests for shared validation + domain layer. No AWS needed. Usage: python scripts/test_local.py"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "layer", "python")))

from shared.validate import clean_phone, normalize_city, validate_blood_type, validate_urgency, ensure_units, parse_bool, parse_body  # noqa: E402

FAIL = []


def eq(name, got, want):
    ok = got == want
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if not ok:
        FAIL.append(name)
        print(f"        got={got!r} want={want!r}")


print("validate_blood_type")
for b in ["A+", "O-", "ab+", " X ", "", None]:
    eq(f"rp({b})", validate_blood_type(b), b.upper().strip() if b and b.strip().upper() in ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] else None)

print("validate_urgency")
eq("urgent", validate_urgency("URGENT"), "urgent")
eq("planned default", validate_urgency(""), "planned")
eq("bogus -> planned", validate_urgency("weird"), "planned")

print("clean_phone")
eq("with +11", clean_phone("+919876543210"), "+919876543210")
eq("no + ", clean_phone("919876543210"), "+919876543210")
eq("spaces/dashes", clean_phone("+91 98765 43210"), "+919876543210")
eq("too short", clean_phone("+919876"), None)

print("normalize_city")
eq("case+space", normalize_city("  New   Delhi "), "new delhi")
eq("empty", normalize_city(None), None)

print("ensure_units")
eq("default", ensure_units(None), 1)
eq("clamp high", ensure_units(99), 4)
eq("clamp low", ensure_units(0), 1)
eq("string", ensure_units("2"), 2)

print("parse_body")
eq("json body", parse_body({"body": '{"a":1}'}), {"a": 1})
eq("missing", parse_body({}), {})
eq("garbage", parse_body({"body": "nope"}), {})

print("parse_bool")
eq("bool passthrough", parse_bool(True), True)
eq("false string", parse_bool("false"), False)
eq("true string", parse_bool("true"), True)
eq("1 string", parse_bool("1"), True)
eq("empty default", parse_bool(""), False)
eq("none default", parse_bool(None), False)
eq("custom default", parse_bool(None, True), True)

print("domain layer")
import shared.domain as dom  # noqa: E402

KEY_FIELD = {
    "USERS_TABLE": "user_id",
    "DONORS_TABLE": "donor_id",
    "REQUESTS_TABLE": "request_id",
    "MATCHES_TABLE": "match_id",
}


class FakeTable:
    def __init__(self, key):
        self.key = key
        self.store = {}

    def get_item(self, Key):
        return {"Item": self.store.get(Key[self.key])}

    def put_item(self, Item):
        self.store[Item[self.key]] = Item
        return {}

    def update_item(self, Key, UpdateExpression="", ExpressionAttributeNames=None, ExpressionAttributeValues=None):
        """Minimal SET/ADD support matching the expressions our Lambdas use."""
        names = ExpressionAttributeNames or {}
        vals = ExpressionAttributeValues or {}
        item = self.store.get(Key[self.key])
        if item is None:
            item = dict(Key)
            self.store[Key[self.key]] = item
        set_part, _, add_part = UpdateExpression.partition("ADD")
        if set_part.strip().upper().startswith("SET"):
            for assign in set_part[3:].split(","):
                attr, _, val = assign.partition("=")
                attr = names.get(attr.strip(), attr.strip())
                item[attr] = vals.get(val.strip())
        if add_part.strip():
            attr, _, val = add_part.strip().partition(" ")
            attr = names.get(attr.strip(), attr.strip())
            item[attr] = (item.get(attr) or 0) + vals.get(val.strip(), 0)
        return {}

    def scan(self, **kw):
        return {"Items": list(self.store.values())[: kw.get("Limit", 100)]}

    def query(self, **kw):
        items = list(self.store.values())
        vals = kw.get("ExpressionAttributeValues", {})
        idx = kw.get("IndexName")
        if idx == "RequesterIndex":
            out = [i for i in items if i.get("requester_id") == vals.get(":r")]
            out.sort(key=lambda i: i.get("created_at", ""), reverse=not kw.get("ScanIndexForward", True))
            return {"Items": out[: kw.get("Limit", 100)]}
        if idx == "DonorMatchIndex":
            city_key = vals.get(":ck", "#")
            out = [i for i in items if i.get("blood_type") == vals.get(":bt") and str(i.get("match_key", "")).startswith(city_key)]
            out = [i for i in out if i.get("available") == vals.get(":t")]
            return {"Items": out[: kw.get("Limit", 100)]}
        if idx == "RequestIndex":
            return {"Items": [i for i in items if i.get("request_id") == vals.get(":r")]}
        if idx == "DonorIndex":
            out = [i for i in items if i.get("donor_id") == vals.get(":d")]
            out.sort(key=lambda i: i.get("created_at", ""), reverse=not kw.get("ScanIndexForward", True))
            return {"Items": out[: kw.get("Limit", 100)]}
        return {"Items": []}


class FakeEnv:
    URGENCIES = {"urgent", "planned"}

    def __init__(self):
        self.tables = {name: FakeTable(key) for name, key in KEY_FIELD.items()}
        self.donor_msgs = []
        self.requester_msgs = []
        self.sms_msgs = []

    def table(self, name):
        return self.tables[name]

    def notify_donor(self, donor, text):
        self.donor_msgs.append(donor["donor_id"])
        return True

    def notify_requester(self, phone, text):
        self.requester_msgs.append(phone)
        return True

    def send_sms(self, phone, text):
        self.sms_msgs.append(phone)
        return True


def new_env():
    env = FakeEnv()
    dom.db = env
    dom.notify = env
    return env


def one_request(env, blood="O+", city="pune", phone="+919876543210", user=None, **extra):
    payload = {"blood_type": blood, "city": city, "phone": phone, "urgency": "urgent", "units": 1}
    payload.update(extra)
    return dom.create_request(user or {"sub": "u1", "email": "a@b.c"}, payload, notify_people=True)


env = new_env()
item, meta = one_request(env)
eq("create -> open", item["status"], "open")
eq("create keeps meta", {"matched": 0, "alerted": 0}, meta)
eq("create requester id", item["requester_id"], "u1")
eq("public strips internals", "requester_id" not in dom.public_request(item), True)

env = new_env()
env.table("USERS_TABLE").store["u1"] = {"user_id": "u1", "is_donor": True, "name": "Old", "email": "a@b.c"}
one_request(env)
eq("donor flag preserved", env.table("USERS_TABLE").store["u1"]["is_donor"], True)
eq("donor name preserved", env.table("USERS_TABLE").store["u1"]["name"], "Old")

env = new_env()
one_request(env, blood="O+", city="Pune")
item2, issues2 = one_request(env, blood="O+", city="Pune")
eq("duplicate blocked", item2, None)
eq("duplicate says conflict", issues2.get("conflict") is not None, True)
item3, _ = one_request(env, blood="O+", city="Mumbai")
eq("different city allowed", item3 is not None, True)
one_request(env, city="Pune", user={"sub": "u2", "email": "c@d.e"})
eq("different user allowed", any(r.get("requester_id") == "u1" and r.get("status") == "open" for r in env.table("REQUESTS_TABLE").store.values()), True)

env = new_env()
for did, blood, city, eligible, available in [
    ("d1", "O+", "pune", True, True),
    ("d2", "O+", "pune", True, False),
    ("d3", "O+", "mumbai", True, True),
    ("d4", "A+", "pune", True, True),
]:
    env.table("DONORS_TABLE").store[did] = {
        "donor_id": did, "name": "D", "phone": "+919800000000", "blood_type": blood, "city": city,
        "donation_eligible": eligible, "available": available, "match_key": f"{city}#{did}",
    }
item, meta = one_request(env)
eq("only eligible+available matched", meta["matched"], 1)
eq("matched donor is d1", env.donor_msgs, ["d1"])

print("donation_eligible")
eq("no date -> eligible", dom.donation_eligible(""), True)
eq("recent donation -> not eligible", dom.donation_eligible("2026-09-01T00:00:00Z"), False)
eq("old donation -> eligible", dom.donation_eligible("2026-01-01T00:00:00Z"), True)
eq("garbage -> eligible", dom.donation_eligible("yesterday"), True)

env = new_env()
for did, last in [
    ("e1", "2026-09-01T00:00:00Z"),
    ("e2", "2026-01-01T00:00:00Z"),
]:
    env.table("DONORS_TABLE").store[did] = {
        "donor_id": did, "name": "E", "phone": "+919800000001", "blood_type": "O+", "city": "pune",
        "donation_eligible": True, "available": True, "last_donation": last, "match_key": f"pune#{did}",
    }
item, meta = one_request(env)
eq("recent donor skipped by live cooldown", env.donor_msgs, ["e2"])
eq("cooldown matched 1", meta["matched"], 1)

print("confirmed/declined counts")
env = new_env()
item, _ = one_request(env)
eq("create confirmed_count", item["confirmed_count"], 0)
eq("create declined_count", item["declined_count"], 0)
eq("public includes confirmed_count", dom.public_request(item)["confirmed_count"], 0)
eq("public includes declined_count", dom.public_request(item)["declined_count"], 0)

env2 = new_env()
item2, _ = one_request(env2)
item2["confirmed_count"] = 3
item2["declined_count"] = 1
eq("public preserves confirmed_count", dom.public_request(item2)["confirmed_count"], 3)
eq("public preserves declined_count", dom.public_request(item2)["declined_count"], 1)

print("respond_match counts")
import importlib.util as _ilu  # noqa: E402
import json as _json  # noqa: E402


def load_lambda(name, rel):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", *rel)
    spec = _ilu.spec_from_file_location(name, path)
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rm = load_lambda("respond_match_app", ("src", "respond_match", "app.py"))
ur = load_lambda("update_request_app", ("src", "update_request", "app.py"))
st = load_lambda("stats_app", ("src", "stats", "app.py"))


def authed(body, sub="u1", path_id=None):
    return {
        "pathParameters": {"id": path_id} if path_id else {},
        "body": _json.dumps(body),
        "requestContext": {"authorizer": {"claims": {"sub": sub, "email": "a@b.c"}}},
    }


def seed_match(env, match_id="m1", donor="d1", req="r1", status="sent", req_status="open"):
    env.table("MATCHES_TABLE").store[match_id] = {
        "match_id": match_id, "donor_id": donor, "donor_name": "D", "donor_phone": "+919800000000",
        "request_id": req, "request_blood_type": "O+", "request_city": "pune",
        "requester_name": "R", "requester_phone": "+919876543210",
        "status": status, "created_at": "2026-09-20T00:00:00Z",
    }
    env.table("REQUESTS_TABLE").store[req] = {
        "request_id": req, "status": req_status, "confirmed_count": 0, "declined_count": 0,
    }
    rm.db = env
    rm.notify = env
    return env


env = seed_match(new_env())
resp = rm.lambda_handler(authed({"action": "confirm"}, sub="d1", path_id="m1"), None)
eq("confirm ok", resp["statusCode"], 200)
eq("match confirmed", env.table("MATCHES_TABLE").store["m1"]["status"], "confirmed")
eq("request confirmed_count 1", env.table("REQUESTS_TABLE").store["r1"]["confirmed_count"], 1)
eq("requester notified on confirm", env.requester_msgs, ["+919876543210"])

resp = rm.lambda_handler(authed({"action": "confirm"}, sub="d1", path_id="m1"), None)
eq("re-confirm idempotent", resp["statusCode"], 200)
eq("no double count", env.table("REQUESTS_TABLE").store["r1"]["confirmed_count"], 1)

env = seed_match(new_env())
resp = rm.lambda_handler(authed({"action": "decline"}, sub="d1", path_id="m1"), None)
eq("decline ok", resp["statusCode"], 200)
eq("match declined", env.table("MATCHES_TABLE").store["m1"]["status"], "declined")
eq("request declined_count 1", env.table("REQUESTS_TABLE").store["r1"]["declined_count"], 1)
eq("no requester sms on decline", env.requester_msgs, [])

env = seed_match(new_env(), req_status="fulfilled")
resp = rm.lambda_handler(authed({"action": "confirm"}, sub="d1", path_id="m1"), None)
eq("confirm on fulfilled blocked", resp["statusCode"], 409)
eq("no count on blocked confirm", env.table("REQUESTS_TABLE").store["r1"]["confirmed_count"], 0)

env = seed_match(new_env())
resp = rm.lambda_handler(authed({"action": "confirm"}, sub="other", path_id="m1"), None)
eq("wrong donor forbidden", resp["statusCode"], 403)

print("update_request lifecycle")
env = new_env()
env.table("REQUESTS_TABLE").store["r1"] = {
    "request_id": "r1", "requester_id": "u1", "blood_type": "O+", "city": "pune",
    "requester_name": "R", "requester_phone": "+919876543210",
    "status": "open", "confirmed_count": 1, "declined_count": 0,
}
env.table("MATCHES_TABLE").store["m1"] = {
    "match_id": "m1", "donor_id": "d1", "donor_phone": "+919800000001", "request_id": "r1", "status": "sent",
}
env.table("MATCHES_TABLE").store["m2"] = {
    "match_id": "m2", "donor_id": "d2", "donor_phone": "+919800000002", "request_id": "r1", "status": "confirmed",
}
ur.db = env
ur.notify = env
resp = ur.lambda_handler(authed({"action": "fulfill"}, path_id="r1"), None)
eq("fulfill ok", resp["statusCode"], 200)
fbody = _json.loads(resp["body"])
eq("fulfill status", fbody["status"], "fulfilled")
eq("fulfill counts passthrough", (fbody["confirmed_count"], fbody["declined_count"]), (1, 0))
eq("sent match closed on fulfill", env.table("MATCHES_TABLE").store["m1"]["status"], "cancelled")
eq("confirmed match kept on fulfill", env.table("MATCHES_TABLE").store["m2"]["status"], "confirmed")
eq("fulfill donor sms sent", env.sms_msgs, ["+919800000001"])
eq("fulfill donor app alert", env.donor_msgs, ["d2"])

resp = ur.lambda_handler(authed({"action": "cancel"}, path_id="r1"), None)
eq("double fulfill blocked", resp["statusCode"], 409)

resp = ur.lambda_handler(authed({"action": "cancel"}, sub="intruder", path_id="r1"), None)
eq("non-owner forbidden", resp["statusCode"], 403)

print("stats donors_ready")
env = new_env()
env.table("DONORS_TABLE").store["d1"] = {"donor_id": "d1", "blood_type": "O+", "available": True, "last_donation": ""}
env.table("DONORS_TABLE").store["d2"] = {"donor_id": "d2", "blood_type": "A+", "available": True, "last_donation": "2026-09-01T00:00:00Z"}
env.table("DONORS_TABLE").store["d3"] = {"donor_id": "d3", "blood_type": "O+", "available": False, "last_donation": ""}
env.table("REQUESTS_TABLE").store["r1"] = {"request_id": "r1", "status": "open", "blood_type": "O+", "city": "pune"}
st.db = env
resp = st.lambda_handler({}, None)
eq("stats ok", resp["statusCode"], 200)
sbody = _json.loads(resp["body"])
eq("stats donors_total", sbody["donors_total"], 3)
eq("stats donors_ready", sbody["donors_ready"], 1)
eq("stats open count", sbody["requests"]["open"], 1)
eq("stats ready by blood", sbody["donors_by_blood_type"], {"O+": 2, "A+": 1})

print()
print()
if FAIL:
    print(f"{len(FAIL)} FAILED: {FAIL}")
    sys.exit(1)
print("All local tests passed.")