import os
import time
import boto3
from datetime import datetime, timezone

BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
URGENCIES = ["urgent", "planned"]

_request_statuses = {"open", "fulfilled", "cancelled", "expired"}
_match_statuses = {"sent", "confirmed", "declined", "cancelled"}

REGION = os.environ.get("REGION", "us-east-1")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def epoch_now():
    return int(time.time())


def _client(name):
    return boto3.client(name, region_name=REGION)


def _resource(name):
    return boto3.resource(name, region_name=REGION)


def table(env_name):
    return _resource("dynamodb").Table(os.environ[env_name])