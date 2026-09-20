# PRD — RaktaSetu

> AI-powered emergency blood & platelet donor network for India.

## 1. Problem

- India faces a **chronic blood shortage**: it needs ~14.8M units/ year but collects ~12.4M. An estimated 1 in 4 cities report shortages during emergency hours.
- When a family needs blood urgently, they rely on **WhatsApp forwards and phone calls in the middle of the night** — slow, unverified, and out of the donor's control.
- Donors who registered at old blood-bank drives are **never matched** to the request; every unit expires after ~42 days.
- There is **no fast, location-aware, verified way** to say: "I need O-negative in Dharwad in the next 6 hours."

The people who suffer: patients, families, hospitals, and the volunteer donors who are willing but cannot be found.

## 2. Who it is for

| Persona | Who they are | Pain today |
|---|---|---|
| Requester | Family member/co-ordinator handling a patient's transfusion need | Panic WhatsApp/text chains; can't reach matching donors fast |
| Donor | Verified volunteer who last donated 90+ days ago | Wants to help but never hears of nearby needs |
| Hospital/bank staff | Emergency desk staff | Manual call lists; no real-time view of open requests |

## 3. Solution

RaktaSetu connects a **verified, geolocated donor pool** to an **urgent request in minutes**:

1. A requester posts a request (blood type, city, hospital, urgency, contact).
2. The system matches **eligible, available donors of the same blood type in the same city**.
3. Matching donors get an instant **SMS alert** (Amazon SNS) plus an in-app alert.
4. A donor confirms → the requester is notified with the donor's contact.
5. Requests expire automatically and are garbage-collected (DynamoDB TTL + EventBridge sweeper).

An **AI assistant** (Amazon Bedrock · Nova) answers eligibility questions in simple language and can even **create a request from a chat message**.

## 4. MVP scope (must ship today)

- [x] Requester: post a request (type, city, hospital, units, urgency, phone)
- [x] Requester: browse live open requests & track own request status
- [x] Donor: register profile (name, phone, blood type, city, last donation)
- [x] Auto-matching: same blood type + city + eligible + available (cap 20)
- [x] Alerts: SMS to donors (SNS) + in-app "My Alerts"
- [x] Donor confirm/decline flow; requester notified on confirm
- [x] Live confirmed/declined donor counts on every request; "donors ready" stat (available + eligible)
- [x] Lifecycle: fulfill / cancel / expire with automatic TTL cleanup
- [x] Public stats dashboard (live counts, by type/city)
- [x] AI assistant: eligibility Q&A + can create a request via tool call
- [x] Auth: Cognito signup/login (email)
- [x] Frontend: static SPA on S3 + CloudFront (public URL -> Ship It)

## 5. Out of scope (post-weekend roadmap)

- Hospital-verified request claims / OTP on blood type
- WhatsApp alerts via AWS Connect / external messaging providers
- Google Map pick-up routing; donor ratings & badges
- Multilingual UI (Hindi / regional) using Bedrock translation
- Nearby-hospital blood-stock integrations (civic APIs)

## 6. Non-functional requirements

- **Free tier:** 100% of stack runs within the AWS Free Tier (serverless, PAY_PER_REQUEST).
- **Privacy:** donor phone numbers visible only to matched parties; no public phone directory.
- **Reliability:** matching tolerates SMS provider failures (in-app alerts always work).
- **Performance:** POST /requests returns in < 1s; matching is async-safe and capped.

## 7. Success metrics (weekend + demo)

- Time from "request posted" to "donor alerted": seconds
- Matching precision: exact blood type & city
- Demo stories: 1 urgent O-negative need matched to a donor in < 1 minute

## 8. Open questions for mentors

- SNS SMS to India numbers: region/eligibility behaviour on a fresh account (sandbox?).
- Bedrock Nova model quotas on a fresh account (safety from rate limits).
- Whether judges prefer rigorous costs table in writeup (we will include one).