#!/usr/bin/env python3
"""Seed sample data for demo: donors + requests, then load a real dashboard."""

import os
import random
import uuid
from datetime import datetime, timedelta, timezone

import boto3

REGION = os.environ.get("REGION", "us-east-1")
USERS = "rakta_users"
DONORS = "rakta_donors"
REQUESTS = "rakta_requests"
MATCHES = "rakta_matches"

CITIES = ["pune", "bengaluru", "delhi", "mumbai", "hyderabad", "dharwad", "nagpur", "lucknow"]
BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
FIRST = ["Aditi", "Rohan", "Sneha", "Karan", "Meera", "Arjun", "Deepa", "Vikram", "Ananya", "Ravi"]
LAST = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Kulkarni", "Das"]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    dynamo = boto3.resource("dynamodb", region_name=REGION)
    donors = dynamo.Table(DONORS)
    reqs = dynamo.Table(REQUESTS)

    count = 0
    for i in range(24):
        blood = random.choice(BLOOD)
        city = random.choice(CITIES)
        donor_id = uuid.uuid4().hex
        item = {
            "donor_id": donor_id,
            "email": f"donor{i}@rakta.demo",
            "name": random.choice(FIRST) + " " + random.choice(LAST),
            "phone": f"+9198{random.randint(10000000, 99999999)}",
            "blood_type": blood,
            "city": city,
            "last_donation": (datetime.now() - timedelta(days=random.randint(100, 300))).strftime("%Y-%m-%d"),
            "donation_eligible": True,
            "available": True,
            "match_key": f"{city}#{donor_id}",
            "updated_at": now_iso(),
        }
        donors.put_item(Item=item)
        count += 1

    open_count = 0
    for i in range(6):
        blood = random.choice(BLOOD)
        city = random.choice(CITIES)
        urgency = random.choice(["urgent", "urgent", "planned"])
        hours = 24 if urgency == "urgent" else 72
        exp = datetime.now(timezone.utc) + timedelta(hours=hours)
        reqs.put_item(
            Item={
                "request_id": uuid.uuid4().hex,
                "requester_id": uuid.uuid4().hex,
                "requester_email": f"req{i}@rakta.demo",
                "requester_name": random.choice(FIRST),
                "requester_phone": f"+9197{random.randint(10000000, 99999999)}",
                "blood_type": blood,
                "city": city,
                "hospital": ["Civil Hospital", "City Care", "Indira Apollo", "District Hospital"][i % 4],
                "note": random.choice(["Planned surgery", "Emergency after accident", "Mother needs platelets", "Thalassemia patient"]),
                "units": random.randint(1, 2),
                "urgency": urgency,
                "status": "open",
                "created_at": now_iso(),
                "expires_at": exp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "ttl": int(exp.timestamp()),
            }
        )
        open_count += 1

    print(f"Seeded {count} donors and {open_count} open requests into {REGION}.")
    print("Open the live app -> Home to see the stats populate.")


if __name__ == "__main__":
    main()