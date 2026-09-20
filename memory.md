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

## Post-commit improvement loops (5+)

### Loop 1 — Requester lifecycle
- Added `RequesterIndex` GSI on RequestsTable (PK `requester_id`, RANGE `created_at`) → `GET /requests/mine` (`src/my_requests/app.py`) + duplicate-request guard.
- `create_request` now returns **409 conflict** (a new `conflict()` response in `shared/api.py`) when the same user already has an open request for the same (blood, city).
- Fixed **is_donor overwrite bug**: `_upsert_user` now merges the existing profile (preserves `is_donor` and the donor's real name instead of replacing it with the requester email).
- Frontend Requests page: "My requests" section with **Mark fulfilled / Cancel / Share (WhatsApp)** buttons wired to `PATCH /requests/{id}` (share URL uses `location.origin`).

### Loop 2 — Ops maturity
- API Gateway `MethodSettings`: throttling (burst 20 / rate 10), `MetricsEnabled`, `DataTraceEnabled: false` on `RaktaApi`.
- Added `Api5xxAlarm` + `CreateRequestErrorAlarm` (CloudWatch), and `RaktaDashboard` (`rakta-live`) with API errors, Lambda errors, DDB capacity, SNS SMS volume.
- Optional cost guard: `EnableCostGuard` / `BudgetAlertEmail` parameters + `RaktaBudget` (AWS::Budgets::Budget, $10/mo, 75% alert) + `BudgetAlertTopic`. **Default `false`** — budgets perms often missing on fresh deploy roles.
- Frontend `api()` gives friendly 429 ("too fast") message; 409 surfaces the server message.

### Loop 3 — Data integrity
- `respond_match` is **idempotent**: re-asserting the same status returns 200 without re-SMS; flipping after responding → 409. Confirm on a non-open (fulfilled/cancelled/expired) request → 409.
- `update_request` fulfill now SMSes **confirmed** donors (personalized "reach the requester now") and closes `sent` matches without leaving them hanging; cancel notifies+cancels **all** responders (sent AND confirmed).
- `expire_stale` cascades: `_close_pending_matches` marks `sent` matches `cancelled` when a request expires (confirmed donors are preserved).
- `seed_sample_data.py` now seeds fulfilled/expired history + a confirmed match so the demo dashboard shows a lifecycle.
- Donor page: "Know before you donate" education card (eligibility, intervals, day-of prep).

### Loop 4 — Assistant (Bedrock)
- New `my_requests` tool in `src/assistant/app.py` (queries `RequesterIndex`) so the bot can answer "what are my requests?".
- `create_request` tool now surfaces the **conflict** message instead of a raw validation error.
- Chat UI: quick-suggestion chips ("Can I donate?", "I need B+ in Nagpur", "What are my requests?") that submit the assistant form.
- Model/region stays a stack Parameter (`AssistantModelId`, default `amazon.nova-lite-v1:0`) so we can swap regions/models at deploy without code changes.

### Loop 5 — Design/UX
- Phone inputs are now `type="tel"` + `inputmode="tel"` + `autocomplete="tel"` (create + donor forms) with a `[+0-9]{10,15}` pattern.
- `aria-live="polite"` on chat box (toast already had it) + `prefers-reduced-motion` CSS guard.
- Consistent empty states across My requests / alerts / feed.

### Loop 6 — Test depth + docs
- `scripts/test_local.py` now covers the **domain layer** with an in-memory dict-backed fake (FakeTable/FakeEnv: puts, gets, GSI queries for RequesterIndex / DonorMatchIndex / RequestIndex). Covers: create happy path, `is_donor` preservation, **duplicate-request 409**, cross-city/cross-user allowance, eligibility+availability match filter. **All 33 checks pass.**
- Docs (README / architecture.md) refreshed for the new endpoint, GSI, alarms/dashboard/budget, assistant tool, and test coverage.

### Loop 7 �?" Full audit + frontend redesign (hour of submission)
- **Critical router bug fixed:** `Views` were keyed by view name but `route()` looked up `Views["#/"]` → `undefined()` crash on every navigation. Now uses a `ROUTES` hash map + `currentRoute`. Verified via headless Edge `--dump-dom` smoke test of all six routes.
- **Signed-out dead zones removed:** Home/Requests feeds used to 401-call authed `/requests`. Now signed-out users see a crafted sign-in card; the public `/stats` payload drives a new **blood-need gap matrix** (8 rows: donor vs open-need bars + status pills) and a count-up stat band — a useful public landing for the demo.
- **Backend integrity:** `update_request` 409 on non-open requests (no double SMS blast); `_match_and_alert` computes **live eligibility** from `last_donation` (query filters only `available`, post-filter in Python); `donor._put` uses `parse_bool` (fixes `bool("false")` → True); `expire_stale` newline; stats `uuid` removed; assistant facts aligned (50 kg, everyone 3 months) with the donor card.
- **Deploy:** `deploy.ps1` + `deploy.sh` now run CloudFront `create-invalidation /*` after `s3 sync`.
- **Visual redesign (no AI-slop):** Fraunces serif + Manrope UI via Google Fonts; oxblood/crimson on warm paper with dotted-grain texture; crafted SVG drop logo/favicon/empty states; live-dot eyebrow; animated gap bars; step tiles; pill nav (mobile scrollable); redesigned badges/toggles/chat/typing dots/sign-in cards; dark ink footer; `prefers-reduced-motion` guard.
- `scripts/test_local.py` extended to **50 checks** (parse_bool table, donation_eligible dates, live-cooldown donor skipped at match time). All pass.

## Links

- Event: <https://www.wemakedevs.org/aws/first-commit>
- Rules: <https://www.wemakedevs.org/aws/first-commit/rules>
- Student verify: <https://bit.ly/abc-verify>
- Credits request: <https://forms.gle/v1fMc8YboFvERz8j6>
- Discord (mentors): <https://discord.gg/wemakedevs>
- Luma (Bangalore build day): <https://luma.com/first-commit>