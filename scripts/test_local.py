#!/usr/bin/env python3
"""Pure-logic tests for shared validation. No AWS needed. Usage: python scripts/test_local.py"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "layer", "python")))

from shared.validate import clean_phone, normalize_city, validate_blood_type, validate_urgency, ensure_units, parse_body  # noqa: E402

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

print()
if FAIL:
    print(f"{len(FAIL)} FAILED: {FAIL}")
    sys.exit(1)
print("All local tests passed.")