# Submission writeup — RaktaSetu

> Fill the blanks, keep this structure. Submission = repo + video + writeup (rules section 04).

## Team

| | Name | University | Year | Register? |
|---|---|---|---|---|
| Captain | _name_ | _university_ | _2027/2028_ | [lastname] AWSCLI + Builder Center verified |
| Member | _name_ | _university_ | _2028_ | |
| Member | _name_ | _university_ | _2028_ | |

Every member needs: WeMakeDevs account + AWS Builder Center profile with **verified student enrolment** (bit.ly/abc-verify). Captain submits once.

## What we built (problem)

RaktaSetu solves a very specific, very Indian emergency: finding a matching blood donor **in your own city, at 2 a.m.** Today that means phone trees and forwarded WhatsApp messages. We built a network where:

- a requester posts blood type + city + hospital in 30 seconds;
- eligible, available donors of that exact type in that city get an **SMS + in-app alert within seconds**;
- the donor confirms in the app and the requester instantly gets their contact.

**Why it matters:** blood has a 42-day shelf life and shortages hit hardest outside metro cities. Minutes matter, and the current "system" is people texting people. We compress hours → seconds, and we never lose a willing donor again.

## Where AWS fits (build)

A single SAM template deploys the whole free-tier stack:

- **Frontend:** static SPA on S3 + CloudFront (Origin Access Control; no public bucket).
- **API:** API Gateway REST, protected by a **Cognito** authorizer (only /stats is public).
- **Compute:** 9 **Lambda** functions (Python 3.12).
- **Data:** **DynamoDB** on-demand — four tables; the matching hot path is a single GSI query (`blood_type` partition + `city#` sort prefix). TTL handles expiry (24h urgent / 72h planned).
- **Notifications:** **Amazon SNS** SMS (SenderID RAKTA) direct-to-phone.
- **Ops:** **EventBridge** scheduled rule sweeps stale requests; DynamoDB TTL cleans up; CloudWatch logs every function.
- **AI:** **Amazon Bedrock · Nova** assistant (Converse API + tool use) answers donor-eligibility questions and **creates requests from chat**.
- **Costs:** on-demand everything. This weekend cost ≈ ₹0/few cents; decision-documented in `architecture.md`.

**AI tools used (required):** OpenCode (model opencode/big-pickle) for scaffolding, Lambda code, frontend and docs. All AWS services and design decisions are ours; we verified every integration path.

## Key tech decisions

1. Serverless, no always-on compute — free tier + scales for a national network.
2. No build-step frontend → one-command deploy via `deploy.ps1`.
3. SMS (not email) as the emergency channel — SES sandboxes new accounts; SNS SMS works immediately.
4. Composite index for the donor-match query (one Query call, not a scan).
5. Agent keeps one tool (`create_request`) — simple, reliable, error-handled.

## What we learned

- One-command shipping: SAM template + no-build SPA.
- DynamoDB key design determines application architecture (index → query → feature).
- Event-driven lifecycle hygiene with TTL + EventBridge.
- Bedrock Converse tool use in production-shape (loop, cap, fallback).

## Links

- Repository: _set public, pasted here_
- Demo video (YouTube, <3 min, unlisted): _link_
- Live URL: _FrontendUrl from deploy.ps1_ (Ship It)
- Product docs: `prd.md`, `architecture.md`, `design.md`