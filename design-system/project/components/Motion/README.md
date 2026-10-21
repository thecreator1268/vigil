# Motion

The reference surface for how VIGIL moves: the two easings, the five durations, and the four sequences that give the system its character — each replayable on demand, with a live `prefers-reduced-motion` toggle that proves the reduced path is a real state change, not a cosmetic skip.

## Why motion is restrained here

Motion in VIGIL confirms; it never performs. A person using this app may be frightened, exhausted, or reading on a cracked screen in poor light — anything that moves for its own sake costs them attention they don't have to spare. So the rule is narrow on purpose: **arrivals get an easing, in-place moves get a different easing, and almost nothing repeats.**

## Easings

- **`ease-out-arrival`** `cubic-bezier(.22,.61,.36,1)` — things entering the screen: rows rising, cards arriving, a check-in's summary settling in. Starts fast, settles gently — it reads as something *arriving*, not bouncing.
- **`ease-in-place`** `cubic-bezier(.45,.05,.25,1)` — things moving within the screen: a question sliding to the next one, a tab switching. Reads as a deliberate, steady move, not a flourish.

No overshoot, bounce, or spring is used anywhere in the system — both curves stay inside their own bounds.

## Durations

`quick` 160ms (micro feedback) · `base` 320ms (standard transitions) · `calm` 520ms (confirmations) · `slow` 900ms (the submit check-draw, the ice halo) · `draw` 1400ms (the trend line draw-in).

## The four sequences, live below

1. **Submit** — button narrows to a circle, a check draws stroke-by-stroke, one soft ice halo pulses once, the summary collapses, confirmation text settles in. Never a spinner.
2. **Alert queue** — rows arrive with a severity-ordered stagger; Acknowledge collapses a row and offers Undo with one flash on restore.
3. **Trend draw-in** — the baseline band eases open, the line draws over `draw`, points appear along the stroke.
4. **Sync breathing ring** — the one continuous loop in the whole system (besides the voice waveform): a ring breathing every 3.4 seconds while syncing is actually happening.

## `prefers-reduced-motion: reduce`

Every duration in the four demos above collapses to effectively instant, stagger collapses to zero, and the breathing ring holds at a fixed partial opacity instead of looping. The toggle in the dev bar flips a local `data-motion` state (initialized from the OS setting) so you can compare both side by side — in production this is driven directly by the OS media query, with no separate "reduced" design to maintain; it's the same system at 1ms.

**Never, under any motion setting:** parallax, scroll-jacking, animated characters, countdowns, confetti.
