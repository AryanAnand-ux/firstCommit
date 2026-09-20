# Demo script — 3-minute video

Record at 1440x900 (or phone landscape), browser light mode, mic on a decent headset. No screen-share lag. Each beat has a hard time budget.

## Beats

| Time | Beat | On screen | Narration (short) |
|---|---|---|---|
| 0:00–0:25 | Hook | Title card + live phone mockup of an SMS alert | "It's 2 a.m. Someone needs O-negative blood in Dharwad. Tonight, that means waking relatives and forwarding WhatsApp messages. RaktaSetu does it in seconds." |
| 0:25–0:50 | Live app + stats | Frontend URL, Home: live stats, open requests | "This is the live app. Here's a real feed of open requests right now — and donors registered across cities." |
| 0:50–1:15 | Post a request | Requests page, fill the form, submit | "I need B+ plasma in Pune for a surgery. Type, city, hospital, urgency, contact. Thirty seconds." |
| 1:15–1:45 | Match + alert | Toast "2 donors alerted" + donor's SMS notification on phone | "RaktaSetu matched eligible, available B+ donors in Pune and SMS-alerted them — with a direct line back to me. No one waits for morning." |
| 1:45–2:15 | The AI assistant | Assistant tab, ask "Can I donate if I got a tattoo 3 months ago?" then "Actually, create an emergency request for O+ in Nagpur" | "The same app has an assistant powered by Amazon Bedrock. It answers eligibility questions — and it can raise the request itself from plain chat." |
| 2:15–2:50 | Architecture + ops | Architecture slide (mermaid) + CloudWatch/console pan | "Under the hood: API Gateway, nine Lambdas, DynamoDB with GT-tuned GSIs, SNS SMS, EventBridge sweeper, Cognito auth, CloudFront edge. Everything on the Free Tier — this weekend cost about zero." |
| 2:50–3:00 | Close | Donor profile page + CTA card | "One unit can be helped by knowing who's nearby. Post the need, or be the donor. rakta... (URL) — join the network." |

## Rules compliance must-haves

- [ ] Runs under 3:00 total (trim narration — silence looks slow).
- [ ] AWS visibly shown: live URL + the architecture slide (the "where AWS fits" ask).
- [ ] Real demo (no mockups for the app screens — record the deployed URL).
- [ ] YouTube upload: public or unlisted; **verify the link plays in a signed-out browser** before submitting.
- [ ] Title: `RaktaSetu — AI-powered emergency blood donor network (AWS Build)`.

## Recording tips

- Sign up + confirm Cognito email before recording so the flow is smooth; loop through the same request twice for a clean take.
- Seed donors first (`python scripts/seed_sample_data.py`) so the match instantly returns 2–3 donors.
- Keep the phone-SMS shot optional — if SMS is unavailable on your account, the in-app My Alerts toast covers it.
- Record narration separately, then cut — 3 minutes is tight.