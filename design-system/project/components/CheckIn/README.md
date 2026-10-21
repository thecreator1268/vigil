# CheckIn

The home screen and the four-question check-in flow — the center of the app, and the screen most likely to be used by someone who is frightened, exhausted, or being watched over their shoulder. Nothing here is required. Everything here is reversible or skippable.

## Anatomy

**Home**
1. A plain greeting (`display`, serif) — never cheerful, never clinical. "Hello. How are you doing today?"
2. One lead sentence stating there's no pressure.
3. The single primary action: **Check in** — full width, `touch-min` tall, the only button on this screen that matters.
4. A calm week indicator — seven small marks, done days filled with a check, today outlined, future days quiet. Ticks in sequence once, on arrival; never re-animates on every visit.
5. A status line: last check-in's relative day, or "You haven't checked in yet" — never "0 check-ins" or a streak count.
6. The crisis entry, pinned at the bottom, always.

**Check-in flow** (up to four questions)
1. An auto-progress segment bar — four segments, filled as questions are answered. **Never a timer, never a countdown.** It reflects what's been answered, not time elapsed.
2. One question per card (`title`), three answer options plus a separate **Skip this one** — skip is deliberately not styled as a fourth option, so it never looks like "the easy answer" sitting among real ones.
3. Selecting an option sweeps an ice fill across the row and grows a radio dot — no checkmark badge, no color change to green/red.
4. Back is always available and never loses an answer already given.
5. The last question asks about safety. Answering "Not really" gives the crisis bar one soft ring — not a popup, not a redirect. The person stays in control of what happens next; the help is simply, visibly, right there.
6. After the fourth question (or a skip), a short summary and **Save my check-in** — the submit sequence from `components/Motion` (button → circle → check draws → halo → summary collapses → confirmation settles in).
7. Confirmation reads **"Saved on this device"** — never "Success," never a checkmark alone. The screen then returns to Home, where the week indicator's new tick appears in its own short sequence.

## Content rules

- The lead line on the first question is literally close to: *"Take a minute for yourself. Skip anything you like."* Said once, not repeated on every question.
- Options are concrete and short — "Poorly," not "I have been having difficulty with sleep lately."
- A missed day, or a fully skipped check-in, never appears as a gap, a broken streak, or a lowered score anywhere in this screen. There is nothing in this component that counts consecutive days.

## States

- Home: never checked in / has checked in today / has checked in on a past day.
- Question: unanswered / answered / the safety question's "Not really" branch (rings the crisis bar).
- Submit: idle → circle → drawing → confirmed.

## Motion

Greeting, lead line, and week row rise with a 70ms stagger on Home's arrival. Done days tick in sequence. Options sweep an ice fill and grow a radio dot on selection (`quick`). The next question slides in from the right inside the same card (`base`, `ease-in-place`); Back slides in from the left. The safety "Not really" answer rings the crisis bar once (`slow`). Submit uses the full sequence documented in `components/Motion`.

## Accessibility

- Every option row and the Skip link meet `touch-min` (56px) height.
- The segment bar is `role="progressbar"` with `aria-valuenow` = questions answered, `aria-valuemax="4"` — never framed as time-based (`aria-valuetext` says "2 of 4 answered," not a duration).
- The crisis bar is reachable by keyboard from anywhere on the screen without passing through the question flow.
