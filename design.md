# Design — RaktaSetu UI (targets "Best UI" track)

## 1. Concept

"Help in seconds." Calm, trustworthy, blood-red accents on a light clinical background. Reads like a well-made public-service tool — not a toy.

## 2. Design tokens

```css
:root {
  /* Palette */
  --oxblood:    #7c1226;   /* primary / actions */
  --oxblood-2:  #a51e34;   /* hover / accents */
  --crimson:    #d63a3a;   /* urgent / live dot */
  --rose:       #fbe9e6;   /* soft alert bg */
  --paper:      #f7f1ea;   /* app background */
  --paper-2:    #fdfaf6;   /* cards */
  --ink:        #2a151c;   /* text */
  --ink-2:      #6b5660;   /* secondary text */
  --ink-3:      #a18e96;   /* muted text */
  --leaf:       #1f7a4d;   /* fulfilled / confirm */
  --amber:      #a8690f;   /* planned / pending */
  --line:       #e9ddd2;   /* hairline borders */

  /* Shape */
  --radius: 18px;
  --radius-sm: 12px;

  /* Type */
  --font-disp: "Fraunces", Georgia, serif;   /* headlines, numbers, chips */
  --font-ui: "Manrope", system-ui, sans-serif; /* body, labels, buttons */
}
```

## 3. Typography

- Fraunces (display serif) for headlines, stat numbers, blood-type chips and counts; Manrope for everything else.
- Headlines: 600 weight, tight tracking (−0.02em), italic accent in `--oxblood`.
- Labels/uppercase eyebrows (`LIVE`, section eyebrows) in 11–12px, letter-spaced 0.05–0.14em.
- Numbers/stat tiles: 34px Fraunces, tabular figures; animated count-up on load.

## 4. Components

| Component | Spec |
|---|---|
| Top bar | Warm paper bg w/ blur, drop logo + "RaktaSetu · the blood bridge", pill nav (scrollable on mobile), user chip + auth pill |
| Blood-type chip | Fraunces 700, `--oxblood` on `--rose`, e.g. `O+` |
| Request card | Paper card, `--radius`, 1px `--line` border; left border accent = urgency (urgent → `--crimson` 4px; planned → `--amber`) |
| Urgency badge | Pill + dot: URGENT (`--oxblood`), PLANNED (`--amber`), SENT (`--crimson`), FULFILLED/CONFIRMED (`--leaf`), CANCELLED/EXPIRED/DECLINED (muted) |
| Confirmed line | `--leaf` meta line under the card title: "**N** donors confirmed · M declined" |
| Stat tile | Paper card, 3px `--oxblood` top border, big Fraunces number, eyebrow label, live dot |
| Gap matrix | 8 blood-group rows: donor bar (`--oxblood` gradient) vs open-need bar, raw counts, status pill (`Covered` / `Needs donors` / `Donors ready`) |
| Chat (assistant) | Requester bubbles `--oxblood` gradient/white; assistant bubbles white/`--ink`; typing indicator dots |
| Toast | Bottom-center pill, `--ink`, white text, 3.4s auto-dismiss |

## 5. Layout

- Max width 1080px, 24px gutters, centered.
- Home: hero (headline + subline + CTA) → live stats row (4 tiles) → "how it works" (3 steps) → open requests feed.
- App shell (authenticated): top bar + content; sections: Requests, Donor, My Alerts, Assistant.
- Mobile-first; touch targets ≥ 44px; one primary action per screen.

## 6. Motion

- 120–180ms ease-out transitions; only on interactive elements.
- Stats tiles pulse the live dot (CSS animation, `prefers-reduced-motion` respected via media query).
- No parallax, no heavy animation — demo-friendly on a screen share.

## 7. Accessibility

- Contrast pairs checked against WCAG AA (blood-on-white 4.6:1, ink-on-cream 9.5:1).
- Visible focus rings; `aria-live` on toasts; semantic `<main>/<nav>/<label>`.
- `prefers-reduced-motion: reduce` disables the pulse.

## 8. Demo note

Screen-record at 1440×900, browser zoom 100%, OS light mode, no dark mode strikethroughs. `DEMO_SCRIPT.md` sequences the tour of these screens.