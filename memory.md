# Memory — project log (decisions, commands, gotchas)

> Working memory for the team + any future agent. Update as we go.

## Project facts

- **Event:** First Commit — AWS Bharat Builds Tour event 01, WeMakeDevs.
- **Dates:** Sept 17–20, 2026. Deadline = Sun Sept 20 (exact hour on event page).
- **Track:** Ship It (deployed live, URL). Also auto-in for Build It / Best UI / runners-up.
- **Judges:** AWS Solution Architects + TAMs (technical panel — architecture matters).
- **Region decision:** `us-east-1` — SMS + Bedrock Nova + free tier all clean there.

## Key decisions (keep these)

| # | Decision | Why |
|---|---|---|
| 1 | Serverless-first: API GW + Lambda + DDB (PAY_PER_REQUEST) | Free tier, easy demo, judged favourite of AWS architects |
| 2 | One SAM template for everything incl. frontend hosting | `sam deploy` → whole stack + URL |
| 3 | Frontend = vanilla JS SPA, NO build step | Zero toolchain risk on last day |
| 4 | SMS via SNS direct `PhoneNumber` publish (no topic/subscriptions) | Email (SES/SNS endpoints) hits sign-up confirmation sandbox on fresh accounts; SMS is sandbox-free |
| 5 | Auto-matching inside `create_request` (sync), not EventBridge fan-out | Fewer moving parts on last day; still event-driven where it matters (scheduled sweeper) |
| 6 | Cognito `USER_PASSWORD_AUTH`, in-app forms (no Hosted UI) | Hosted UI callback URL needs the CloudFront domain → circular dependency late in the build |
| 7 | Capped matches at 20; SMS best-effort (errors logged, UI always works) | Never let SMS failure break the demo |
| 8 | `GET /stats` is the only public endpoint | Privacy + a public landing page for the video |
| 9 | Lambda layer structure: `src/layer/python/shared/` | SAM layers need the `python/` folder so `import shared` resolves at `/opt/python` |

## Environment (this machine)

- `python 3.14.4`, `node v24.14.1`, `git 2.53`, PowerShell 5.1 — **no** SAM/AWS CLI/Docker here.
- So deploy runs on the team's machine; repo keeps everything scripted for one-command deploy.

## Commands that work

```powershell
# Live: build + deploy + push frontend (run from repo root)
.\deploy.ps1

# Live: re-upload frontend only (after edits) — uses saved config
.\deploy.ps1 -FrontendOnly

# Local API (Build It fallback) — needs AWS creds for DDB/SNS
sam local start-api --template template.yaml

# Local pure-logic tests (no AWS)
python scripts/test_local.py
```

## Gotchas to remember

- SAM layers: put Python packages under `python/` inside the layer `ContentUri`, drop the `Metadata.BuildMethod` for pure-boto3 layers. `import shared` then works in handlers.
- Cognito claims reach Lambda at `event.requestContext.authorizer.claims` (key `custom:isDonor`).
- DynamoDB `begins_with()`, `FilterExpression` and `ExclusiveStartKey` are the tools for cursor queries on GSIs (used in donor matching + expiry sweep).
- TTL in DynamoDB needs a **numeric epoch** attribute; sort keys/comparisons use ISO strings (`StatusIndex` sorts "open" by `expires_at` ISO — consistent UTC format required).
- SNS `Publish` with `PhoneNumber` needs no topic; add `AWS.SNS.SMS.SMSType: Transactional` attributes.
- Bedrock Converse tool-use loop: append assistant message → append `toolResult` as a user message → second call; stop when `stopReason != tool_use`. Model id is a Parameter so we can swap regions.
- CloudFront + S3 = private bucket + OAC + bucket policy conditioned on `AWS:SourceArn` (never `PublicRead`).

## What we learned (DON'T DELETE — judged)

- Fresh-account email delivery: SES is sandboxed (only verified recipients) → SMS wins for outbound alerts.
- One-command serverless deploys are possible with a single SAM template if the frontend has no build step.
- Agent tool-use with Nova: keep tools minimal; guard the loop with a max-iteration cap.
- Free tier math is demoable: show the cost section in the writeup ($0–few cents/weekend).

## Links

- Event: <https://www.wemakedevs.org/aws/first-commit>
- Rules: <https://www.wemakedevs.org/aws/first-commit/rules>
- Student verify: <https://bit.ly/abc-verify>
- Credits request: <https://forms.gle/v1fMc8YboFvERz8j6>
- Discord (mentors): <https://discord.gg/wemakedevs>
- Luma (Bangalore build day): <https://luma.com/first-commit>