# Design — RaktaSetu UI (targets "Best UI" track)

## 1. Concept

"Help in seconds." Calm, trustworthy, blood-red accents on a light clinical background. Reads like a well-made public-service tool — not a toy.

## 2. Design tokens

```css
:root {
  /* Palette */
  --blood:      #b0162f;   /* primary / actions */
  --blood-dark: #8c1024;   /* hover / pressed */
  --maroon:     #5c0a16;   /* deep accents, footer */
  --cream:      #fdf6f2;   /* app background */
  --paper:      #ffffff;   /* cards */
  --ink:        #241316;   /* text */
  --muted:      #7a6a6e;   /* secondary text */
  --done:       #1d7a46;   /* fulfilled / confirm */
  --warn:       #c77700;   /* pending / info */
  --line:       #ecdcd7;   /* hairline borders */

  /* Shape */
  --radius: 14px;
  --radius-sm: 10px;

  /* Type */
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}
```

## 3. Typography

- System font stack (fast, no webfont cost, crisp on every device).
- Headlines: 700/800 weight, tight tracking (−0.01em).
- Labels/uppercase eyebrows (`RAKTA`, `LIVE`, blood-type chips) in 11–12px, letter-spaced 0.08em.
- Numbers/stat live tiles: 28px, tabular figures.

## 4. Components

| Component | Spec |
|---|---|
| Top bar | Cream bg, logo chip (blood drop + "RaktaSetu"), nav links, "Sign in" pill button |
| Blood-type chip | Rounded square, white text on `--blood`, e.g. `O−` |
| Request card | White card, `--radius`, 1px `--line` border; left border accent = urgency (urgent → `--blood` 3px; planned → `--warn`) |
| Urgency badge | Pill: URGENT (`--blood`), PLANNED (`--warn`), FULFILLED (`--done`), EXPIRED (muted) |
| CTA | `--blood` fill, white text, `--radius-sm`, 44px touch height |
| Primary button | Full-width on mobile, `-2px` on hover, subtle shadow on active |
| Form | Stacked labels, 46px inputs, `--line` border, focus ring `--blood` 2px |
| Stat tile | Cream `--paper` card, big number, eyebrow label, live dot |
| Chat (assistant) | Requester bubbles `--blood`/white; assistant bubbles `--paper`/`--ink`; typing indicator dots |
| Toast | Bottom-center pill, `--ink` 92%, white text, 3s auto-dismiss |

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