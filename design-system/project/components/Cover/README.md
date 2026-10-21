# Cover

The design system's own title card — what someone sees before anything else. It states the feeling in one word and carries it in five swatches, so the rest of the system can be judged against it.

## Anatomy

1. **Wordmark** — "VIGIL," set in the tracked-caps serif treatment, scaled up for a cover (56px here; the in-product wordmark token stays at 18/24 — see `components/IconCircle` and `CheckIn` for that size in context).
2. **Tagline** — one sentence, sans body-lg: *"A dignity-first check-in, redesigned to feel steady."*
3. **Feeling chip** — the single word this whole system is judged against: *steady*.
4. **Palette strip** — five swatches that carry the feeling: `primary`, `ice`, `ice-strong`, `coral`, `panel`. Shown with their names and a one-line reason, not hex codes first — the reason matters more than the value.
5. A small cluster of `IconCircle`s (shield, moon, phone) in the background, quiet and out of focus, as texture rather than UI.

## Content rules

- The tagline is the only sentence on this screen — no second paragraph, no feature list. A cover states the feeling; it doesn't sell it.
- "steady" is never capitalized, bolded past its chip weight, or given an exclamation mark — the word has to demonstrate the voice rule, not just name it.

## States

- **Light / dark** — toggle in the dev bar, top right. Dark is the real app-shell navy, so the cover should feel *more* at home in dark, not less.
- **Reduced motion** — the one-time entrance stagger collapses to instant; nothing else on this screen moves.

## Motion

Arrival only: wordmark, tagline, chip and palette strip rise in sequence with a 70ms stagger, `ease-out-arrival`, `base` duration. It plays once on load and never repeats — this screen has no continuous motion.

## Accessibility

- Palette swatches are not color-only: each has a visible name and a one-line usage note.
- Contrast: `ink`-on-`canvas` and `on-primary`-on-`primary` both exceed 7:1 in both themes (see `tokens.json`).
