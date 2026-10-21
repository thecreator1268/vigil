# IconCircle

The one icon motif used everywhere in VIGIL: an icon centered inside a soft tinted circle. Every icon anywhere in the product — nav, confirmations, the crisis bar, the counselor queue — is an IconCircle. There is no second icon treatment.

## Anatomy

- A circle (`radius-circle`, 50%) filled with a tone.
- One icon centered inside it, sized at **50% of the circle's diameter**.
- 24px icon grid, 1.8px stroke, round caps and joins — never a filled/solid icon style.

## Tones

| Tone | Fill | Icon color | When |
|---|---|---|---|
| `ice` | `ice` | `on-ice` | Default — the resting, everyday tone. Most icons in the app use this. |
| `ice-strong` | `ice-strong` | `on-ice` | Tier-2 emphasis — a second alert tier, a pressed/active state. |
| `primary` | `primary` | `on-primary` | Done, selected, "on" — a completed check-in day, a chosen answer. |
| `coral` | `coral-tint` | `coral-ink` | **Urgent only.** Even here the circle fill is the soft `coral-tint`, not the raw `coral` — the icon's color (`coral-ink`) carries the urgency, so the circle itself stays calm at rest. |

## Sizes

28 · 32 · 48 · 64 · 88px diameter. As a rule of thumb: 28–32 for inline/list rows, 48 for card headers, 64–88 for a screen's single focal icon (the Explainer, a confirmation screen).

## Starter icon set

`phone` `device` `lock` `cloud` `sync` `check` `mic` `text` `tap` `moon` `trend` `users` `eye` `bell` `shield` `alert` `clock` — plus three navigational utilities (`arrow`, `back`, `close`) used across the screens. All defined once in `assets/icons.js`.

## Content rules

- An IconCircle never stands alone as the only indicator of meaning — it is always paired with a text label nearby. Color and icon choice support the words; they never replace them.
- `coral` tone is reserved for the two urgent contexts named in the brand book (the 112 button, the top counselor alert tier). If you reach for it anywhere else, use `ice-strong` instead.

## Accessibility

- The `<svg>` is always `aria-hidden="true"`; the meaning lives in the adjacent text, which is what screen readers announce.
- Every tone/background pairing meets at least 3:1 for the icon stroke against its circle fill (checked in the preview's contrast note).
