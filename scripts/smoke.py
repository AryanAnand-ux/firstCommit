#!/usr/bin/env python3
"""Smoke test against the deployed stack (call after deploy.ps1). Usage:
    python scripts/smoke.py [ApiEndpoint]   e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/prod
"""

import sys
import urllib.request
import urllib.error


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else None
    if not base:
        base = input("Paste the ApiEndpoint from deploy output (https://.../prod): ").strip()
        if not base:
            sys.exit("No endpoint given")

    print(f"1) GET /stats (public)      -> ", end="", flush=True)
    status, body = get(f"{base}/stats")
    print(f"{status}" + (f"  {body[:160]}" if status == 200 else f"  {body[:300]}"))

    print(f"2) GET /requests (no token) -> ", end="", flush=True)
    status, body = get(f"{base}/requests?status=open")
    print(f"{status}  (401 = correct, authorizer working)")

    print("If step 1 returned stats JSON, the API + DDB are healthy.")
    print("Next: open the Frontend URL, sign up, confirm code, post a request, register a donor, confirm a match.")


if __name__ == "__main__":
    main()