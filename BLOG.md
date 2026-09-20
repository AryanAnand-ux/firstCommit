# Blog: RaktaSetu — how we shipped an emergency blood network in 72 hours

> Target: AWS Builder Center blog — top-5 blogs win a Logitech gaming keyboard (separate prize). Adapt to ~800 words, add screenshots + the mermaid diagram from `architecture.md`.

## The problem

The most stressful hour of my family's life was at 2 a.m., calling every relative with a known blood type. That's how blood is found in most of India today — people texting people, WhatsApp forwards, and luck. Blood has a 42-day shelf life, shortages cluster in non-metro cities, and the donors who registered at a drive last year are unreachable.

So for the First Commit hackathon we built **RaktaSetu**: post a request (blood type, city, hospital, urgency), and every eligible, available donor of that type in that city gets an SMS within seconds.

## The stack (and the honesty)

Everything runs inside the AWS Free Tier from a single SAM template:

- **API Gateway** + **Cognito** auth
- **10 Lambda** functions (Python 3.12)
- **DynamoDB** on-demand, with the matching hot path as one GSI query (`blood_type` primary, `city#` sort prefix)
- **SNS SMS** for alerts (SenderID `RAKTA`)
- **EventBridge** to sweep stale requests + **DynamoDB TTL** for cleanup
- **S3 + CloudFront** (OAC, private bucket) for the no-build frontend
- **Amazon Bedrock Nova** assistant with tool use — it can even post a request from chat

## What fought back

**Email sandboxes.** Fresh account → SES only emails verified addresses, SNS email endpoints need opt-in. That decision (SMS wins for emergency alerting) is now baked into our architecture doc.

**DynamoDB indexes.** We initially tried to match donors with scans. The composite GSI turned a scan into a query — the single biggest simplification.

**Bedrock tool-use loop.** Converse API is genuinely simple: one tool, one loop, capped iterations, graceful fallback. Full code in the repo.

## One-command shipping

The frontend is vanilla JS with zero build step, so `.\deploy.ps1` does everything: `sam build`, `sam deploy`, writes `config.js`, syncs S3. From a blank account to a live URL in ~15 minutes.

## What's next

Hospital-verified requests, WhatsApp alerting, Hindi toggle, and a rating system that keeps the network trustworthy.

Code (MIT): _your-repo-link_. Built with OpenCode (model opencode/big-pickle) for scaffolding; every decision, integration and test is documented in `architecture.md`.