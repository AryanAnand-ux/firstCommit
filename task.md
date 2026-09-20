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

- [ ] ✅ SAM `template.yaml` (9 AWS services)
- [ ] 🔴 `assistant/app.py` — Bedrock Nova agent w/ tool use
- [ ] 🔴 `donor/app.py` — profile GET/PUT + eligibility flag
- [ ] 🔴 `matches/app.py` — donor "My Alerts"
- [ ] 🔴 `respond_match/app.py` — confirm/decline → notify requester
- [ ] 🔴 `stats/app.py` — public dashboard
- [ ] 🔴 `expire_stale/app.py` — EventBridge sweeper
- [ ] 🔴 `update_request/app.py` — fulfill/cancel
- [ ] 🔴 `list_requests/app.py` — browse open requests
- [ ] ✅ `create_request/app.py` — post + match + SMS
- [ ] ✅ shared layer (db/notify/validate/api/domain)

## Frontend

- [ ] `frontend/index.html` + `app.css` + `app.js` (design tokens in `design.md`)
- [ ] Auth (Cognito signup/confirm/login) via amazon-cognito-identity-js
- [ ] Pages: Home/stats, Requests, Donor profile, My Alerts, Assistant
- [ ] `config.template.js` → generated `config.js` with live API/userpool values

## Docs (for judges + writeup)

- [ ] ✅ `prd.md`, `architecture.md`, `rules.md`, `design.md`
- [ ] ✅ `README.md` (hero + architecture + quickstart + what-we-learned)
- [ ] 🔴 `WRITEUP.md` — final copy w/ AI-tools disclosure
- [ ] 🔴 `DEMO_SCRIPT.md` — 3-min beat sheet
- [ ] 🟡 `BLOG.md` — AWS Builder Center post (top-5-blogs = Logitech keyboard)

## Submission (deadline: today, Sept 20)

- [ ] `git push` to **public** GitHub repo (history = inside Sept 17–20)
- [ ] Deploy live; grab **FrontendUrl**
- [ ] Record <3-min YouTube demo (unlisted); verify in signed-out browser
- [ ] Fill submission form: repo + video + writeup
- [ ] Request extra credits if needed: <https://forms.gle/v1fMc8YboFvERz8j6>
- [ ] Post blog (optional, keyboard prize)

## Ideas if time (prize multipliers)

- 🟡 Add a WhatsApp-style share sheet so requesters can post the live request link
- 🟡 CloudWatch dashboard + screenshot in video (shows ops maturity)
- 🟡 Hindi toggle (Bedrock translation) — hits "Agents and AI" harder
- 🟡 DDB `on-demand` → mention in writeup as deliberate cost decision