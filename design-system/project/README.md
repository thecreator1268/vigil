# VIGIL — Design System

A dignity-first, offline-capable check-in app for survivors of atrocities, with a trend dashboard for their counselors.

This is a **screen redesign** of the existing navy VIGIL PWA — not a rebrand. The wordmark, the navy, the care behind the real app's crisis-handling and privacy rules all stay. What changes is how calm every screen *feels*.

> **Every decision serves one feeling: steady.**
> Calm and clinical-adjacent — never clinical-cold, never playful, never alarming.

If a choice doesn't make the app feel steadier, it doesn't belong here, no matter how polished it looks.

---

## 1. Content voice

The person using this app may be mid-crisis, reading at a low-literacy level, on a shared or borrowed phone, afraid of being found out. Every sentence is written for that person first.

- **Short, plain, second-person sentences. One idea each.** "Take a minute for yourself. Skip anything you like." Not: "Please take a moment to reflect and respond to the following prompts at your own pace."
- **State where data lives before anything else.** "Saved on this device." "Nothing has left your phone." Say this *before* any technical status, every time it's relevant.
- **Offer, never demand.** Every question has "Skip this one." A missed day is "fine" — not a gap, not a streak broken. There are no streaks, and no guilt language, anywhere.
- **Sentence case only.** No exclamation marks. No emoji. No jargon. The word "sync" never appears to the person — it's always "Syncing quietly" or "Synced."
- **Counselors read reasons, never scores.** "Wrote about feeling unsafe at night, and has slept poorly for 4 days in a row." Numbers only ever appear as days, dates, or case IDs — never as a score, percentage, or chart axis value.
- **Alert tiers read as instructions, not alarms.** "Reach out today." "Reach out this week." "Keep an eye on." Not "HIGH RISK" or "CRITICAL."
- **Shared notes state their own consent.** "Notes appear only because Meera chose to share them with you." Consent is never implied by a note simply being visible — it's said out loud, every time.

**Quick check for any new copy:** read it aloud. If it sounds like a form, a warning label, or a motivational app, rewrite it. It should sound like a calm person speaking to someone they respect.

---

## 2. Color

Full values with usage notes live in [`tokens.json`](tokens.json) (list-shaped `{name, value, usage}`, light + dark) and are mirrored in [`assets/tokens.css`](assets/tokens.css) as CSS custom properties.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#ffffff` | `#0f1f3d` | App background. Dark is the real app-shell navy — a night mode, not an inverted palette. |
| `panel` | `#f5f7fa` | `#172a52` | Cards, sheets, wells. |
| `border` | `#c9d3e0` | `#2d4373` | Hairlines only. |
| `border-strong` | `#7a88a3` | `#6f85b0` | Every control's edge — 3:1 minimum. |
| `ink` / `ink-muted` | `#1e2761` / `#46517a` | `#eef3fb` / `#aebbd6` | Primary / secondary text (muted meets 7:1). |
| `primary` / `on-primary` | `#1e2761` / `#fff` | `#dcebfb` / `#1e2761` | Primary buttons, selected states. Flips in dark mode so filled buttons stay readable. |
| `ice` / `on-ice` | `#dcebfb` / `#1e2761` | `#24407a` / `#dcebfb` | The **one repeated calm tint** — icon circles, the trend baseline band, the crisis entry's resting fill. |
| `ice-strong` | `#b7d3f2` | `#35589f` | Second attention tier, pressed ice states. |
| `coral` / `on-coral` | `#e8735a` / `#1e2761` | `#f08a72` / `#1e2761` | **Urgent/crisis only** — the 112 call button, the top counselor alert tier. Never decorative. |
| `coral-tint` / `coral-ink` | `#fce8e3` / `#9c3420` | `#3d2a3f` / `#ffb9a8` | Soft urgent-tier rows/badges — the coral feeling without full saturation. |
| `focus-ring` | `#1e2761` | `#dcebfb` | Solid 3px ring, 3px offset, on every focusable element. |
| `scrim` | `rgba(15,31,61,.45)` | `rgba(0,0,0,.55)` | Behind the crisis sheet. |

**The one rule that matters most:** coral is a siren, not a decoration. It appears in exactly two places — the 112 call button, and the top (urgent) tier of a counselor's alert queue. It is never used for form errors, a missed day, a low battery, or anything else that isn't an actual emergency. If you reach for coral and it isn't one of those two places, reach for `ice-strong` instead.

Dark mode is a genuine second palette tuned for low light and readability, not `canvas` and `ink` swapped — see `tokens.json` for every pairing.

---

## 3. Type

Two families, each with one job.

- **Serif — "Source Serif 4"** (fallback Cambria, Georgia): headings only. Greetings, question titles, card/section headers, the VIGIL wordmark. The serif is what makes this feel considered rather than clinical; it never appears in body copy.
- **Sans — "Source Sans 3"** (fallback Segoe UI, system-ui): everything else.

| Token | Size / line | Weight | Family | Use |
|---|---|---|---|---|
| `display` | 36/42 | 600 | serif | Greetings/confirmations — one per screen, at most |
| `title` | 28/34 | 600 | serif | Questions, screen titles |
| `heading` | 22/30 | 600 | serif | Card/section headers |
| `wordmark` | 18/24, +3px tracking, caps | 600 | serif | "VIGIL," wherever it appears |
| `body-lg` | 19/28 | 400 | sans | Lead text |
| `body` | 17/26 | 400 | sans | Default — the size floor for anything a person must read |
| `label` | 16/22 | 600 | sans | Buttons, options, tabs |
| `caption` | 14/20 | 400 | sans | Timestamps/status **only** |

Production self-hosts both families and precaches them in the service worker, so type never flashes unstyled offline. Previews in this system load from Google Fonts for display convenience only (see `assets/fonts.css`).

---

## 4. Space, radius, shadow

**Space** — an 8px-rooted scale: `space-1`…`space-7` = 4, 8, 12, 16, 24, 32, 48px. Touch targets are `touch-min` (56px) everywhere a person checks in, and `touch-min-counselor` (44px) only in the denser counselor dashboard.

**Radius** — `radius-sm` 8 (inputs, chips) · `radius-md` 14 (buttons, option rows) · `radius-lg` 22 (cards, sheets) · `radius-pill` 999 · `radius-circle` 50%.

**Shadow** — `shadow-soft` (phone frames, resting panels — barely visible) and `shadow-sheet` (a bottom sheet over the scrim). **Importance is never carried by shadow.** A heavier shadow never substitutes for better copy, color, or hierarchy — if a card needs to stand out, that's a content or color decision, not a shadow one.

---

## 5. Iconography

One motif, everywhere: **IconCircle** — an icon centered inside a soft tinted circle. See [`components/IconCircle`](components/IconCircle) for the full build.

- 24px grid, 1.8px stroke, round caps and joins (Feather Icons' geometry, for continuity with the production app's existing `react-icons/fi` usage).
- Icon sits at 50% of the circle's diameter.
- **Tones:** `ice` (default — the resting, everyday tone), `ice-strong` (tier 2 / emphasis), `primary` (done, selected, "on"), `coral-tint` (urgent only — paired with `coral-ink`, never the raw `coral` fill, so even the urgent tone stays legible and calm at rest).
- **Sizes:** 28 / 32 / 48 / 64 / 88px diameter.
- **Starter set:** phone, device, lock, cloud, sync, check, mic, text, tap, moon, trend, users, eye, bell, shield, alert, clock — defined once in [`assets/icons.js`](assets/icons.js).

Icons never carry meaning alone — every IconCircle sits next to a text label. Color and shape (which tone, which icon) support the words; they don't replace them.

---

## 6. Motion

Motion here is **steady, never fun.** It confirms what happened; it never performs.

**Easings**
- `ease-out-arrival` `cubic-bezier(.22,.61,.36,1)` — things entering the screen.
- `ease-in-place` `cubic-bezier(.45,.05,.25,1)` — things moving within the screen.
- No overshoot, bounce, or spring, anywhere.

**Durations** — `quick` 160ms · `base` 320ms · `calm` 520ms · `slow` 900ms · `draw` 1400ms.

**Signature sequences** (full working demos in [`components/Motion`](components/Motion)):

- **Submit** — the button narrows to a circle, a hand-drawn check draws via `stroke-dashoffset` over `slow`, one soft ice halo pulses once, the summary collapses, "Saved on this device" settles in. **Never a spinner.**
- **Check-in** — greeting/prompt/week-row rise with a 70ms stagger; done days tick in sequence; options sweep an ice fill and grow a radio dot; the next question slides in from the right (left on Back) inside the same card; voice shows a quiet waveform; a "Not really" safety answer gives the crisis bar one soft ring.
- **Alert queue** — severity-ordered fade+rise stagger on load; Acknowledge collapses height and fades, with an Undo toast that slides up and can restore with one flash; a new incoming alert expands into place with one flash; summary tiles count up.
- **Trend** — the line draws in over `draw`, the baseline band eases open, points appear along the stroke as it goes; hover or arrow keys move a guide line plus a tooltip that states, in words, whether a day was lighter, within, or heavier than usual.
- **Shared-element morphs** via the View Transitions API, on named elements `vg-card`, `vg-person`, `vg-qin` — the check-in card becomes the question card; a person's circle travels from the queue into their detail view.
- **Explainer diagrams** animate once on arrival, then hold still. They never loop.

**The only continuous animation in the whole system:**
1. Sync status — a slow ring breathing every 3.4s while syncing, settling to a static check when done.
2. The quiet listening bars during voice recording.

Nothing else loops, ever.

**`prefers-reduced-motion: reduce`** — every duration collapses to 1ms, stagger to 0, the sync ring holds at a partial opacity instead of breathing, and view transitions are skipped outright. State still changes; it just changes instantly. This is implemented as real token overrides (see `assets/tokens.css`), not a cosmetic toggle — reduced motion gets the identical experience, at 1ms.

**Never:** parallax, scroll-jacking, animated characters, countdowns, confetti.

---

## 7. Screens & components

| Component | What it is |
|---|---|
| [Cover](components/Cover) | The system's own title card. |
| [IconCircle](components/IconCircle) | The icon-in-circle primitive, every tone × size, full icon set. |
| [Motion](components/Motion) | Easing/duration reference and the live choreographed sequences. |
| [SyncStatus](components/SyncStatus) | The header pill: Saved on this device / Syncing quietly / Synced. |
| [CheckIn](components/CheckIn) | Home screen, the always-on crisis entry, the 4-question flow, the saved confirmation. |
| [Explainer](components/Explainer) | The 5-step first-run walkthrough. |
| [CounselorDashboard](components/CounselorDashboard) | Alert queue + per-person trend, for counselors. |

Each component folder has its own `README.md` (purpose, anatomy, states, content rules, accessibility) and a self-contained `preview.html` built on the shared tokens and primitives in `assets/`.

---

## 8. Build rules for any new screen

Apply these to anything added later, not just the seven components above:

1. **Crisis entry on every person-facing screen** — one tap away, never behind a menu, never collapsed by default.
2. **Body text 17px or larger.** `caption` (14px) is reserved for timestamps and status text — never for anything a person must read to understand or act.
3. **Any trend shown to a counselor must have a baseline band and word labels** ("Lighter" / "Heavier," never numbers on the axis). Never plot or print a raw score, anywhere a counselor can see it.
4. **No countdowns, no red chrome, no badges or toasts directed at the person checking in.** Coral is reserved for urgency only — the 112 button and the top counselor alert tier. Nothing else is ever coral.
5. **Pair every confirmation with where the data lives** ("on this device," "synced to your counselor") — never with a bare technical status word like "Success" or "Done."

If a new screen can't satisfy all five, it isn't ready — the fix is almost always to simplify the screen, not to make an exception to the rule.
