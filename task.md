# Task board — RaktaSetu

Status: 🔴 do today (Sept 20), 🟡 if time, ✅ done.

## Pre-reqs (team must do today)

- [ ] Create AWS account (fresh, no credit card needed): <https://aws.amazon.com/free>
- [ ] Verify student enrollment on AWS Builder Center: <https://bit.ly/abc-verify> (required for prizes)
- [ ] Install: AWS CLI (`winget install Amazon.AWSCLI`), SAM CLI (`winget install aws-sam-cli` or python `pip install awsamplify` → <https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html>)
- [ ] `aws configure` (Access Key + Secret + region `us-east-1`)

## Deploy

- [ ] `.\deploy.ps1` (one command: build → deploy → push frontend → print URL)
- [ ] Smoke test: open **FrontendUrl**, sign up, post a request, register 2 donors, confirm a match, watch stats update

## Build code

- [x] ✅ SAM `template.yaml` (10 AWS services incl. CloudWatch + Budget; 27 resources)
- [x] ✅ `assistant/app.py` — Bedrock Nova agent w/ tool use (create_request, list_open_requests, my_requests)
- [x] ✅ `donor/app.py` — profile GET/PUT + eligibility flag
- [x] ✅ `matches/app.py` — donor "My Alerts"
- [x] ✅ `respond_match/app.py` — confirm/decline → notify requester (idempotent)
- [x] ✅ `stats/app.py` — public dashboard
- [x] ✅ `expire_stale/app.py` — EventBridge sweeper (cascades pending matches)
- [x] ✅ `update_request/app.py` — fulfill/cancel (notifies confirmed donors)
- [x] ✅ `list_requests/app.py` — browse open requests
- [x] ✅ `my_requests/app.py` — GET /requests/mine (RequesterIndex GSI)
- [x] ✅ `create_request/app.py` — post + match + SMS (409 on duplicate open request)
- [x] ✅ shared layer (db/notify/validate/api/domain)

## Frontend

- [x] ✅ `frontend/index.html` + `app.css` + `app.js` (design tokens in `design.md`)
- [x] ✅ Auth (Cognito signup/confirm/login) via amazon-cognito-identity-js
- [x] ✅ Pages: Home/stats, Requests (+ My requests w/ fulfill/cancel/share), Donor profile (+ education card), My Alerts, Assistant (+ quick chips)
- [x] ✅ `config.template.js` → generated `config.js` with live API/userpool values

## Docs (for judges + writeup)

- [x] ✅ `prd.md`, `architecture.md`, `rules.md`, `design.md`
- [x] ✅ `README.md` (hero + architecture + quickstart + what-we-learned)
- [ ] 🔴 `WRITEUP.md` — final copy w/ AI-tools disclosure
- [ ] 🔴 `DEMO_SCRIPT.md` — 3-min beat sheet
- [ ] 🟡 `BLOG.md` — AWS Builder Center post (top-5-blogs = Logitech keyboard)

## Submission (deadline: today, Sept 20)

- [x] ✅ `git push` to **public** GitHub repo (history = inside Sept 17–20)
- [ ] Deploy live; grab **FrontendUrl**
- [ ] Record <3-min YouTube demo (unlisted); verify in signed-out browser
- [ ] Fill submission form: repo + video + writeup
- [ ] Request extra credits if needed: <https://forms.gle/v1fMc8YboFvERz8j6>
- [ ] Post blog (optional, keyboard prize)

## Improvement loops (done Sept 20)

- ✅ Loop 1 requester lifecycle: my_requests endpoint/UI, dedupe guard 409, is_donor-preserve fix
- ✅ Loop 2 ops: throttling, alarms, ops dashboard, optional budget, 429 UX
- ✅ Loop 3 integrity: respond idempotency, fulfill→confirmed SMS, expire cascade, seed history, donor education
- ✅ Loop 4 AI: my_requests tool, conflict surfacing, quick chips
- ✅ Loop 5 UX: tel inputs, aria-live, reduced motion, empty states
- ✅ Loop 6 tests: fake-table domain tests (33 checks) + docs sync

## Ideas if time (prize multipliers)

- 🟡 Hindi toggle (Bedrock translation) — hits "Agents and AI" harder
- 🟡 WhatsApp deep-link share → already shipped in My requests (Share button)
- 🟡 CloudWatch dashboard screenshot in video (already live: `rakta-live`)
- 🟡 Optional `EnableCostGuard` param → enabled for long-running deployments