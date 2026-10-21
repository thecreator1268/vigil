# SyncStatus

The small pill in the header that answers, in plain words, where a check-in's data is right now. It is the one place "sync" as a *word* is allowed to imply technical activity — and even there, the person only ever reads "Syncing quietly."

## States

| State | Icon / tone | Text | Motion |
|---|---|---|---|
| **Saved on this device** | `device`, `ice` | "Saved on this device" | Static. This is the resting state the moment a check-in is submitted, before any network activity. |
| **Syncing quietly** | `sync`, `ice` | "Syncing quietly" | The **only** continuous loop permitted outside voice recording: a soft ring breathes around the icon every 3.4s, for as long as syncing is actually happening. |
| **Synced** | `check`, `primary` | "Synced" | The breathing ring settles to a single static check — no pulse, no checkmark animation beyond that settle. |

There is no "offline" or "failed" variant shown here by design: a failed sync silently retries and the pill simply stays on "Saved on this device" for longer. The person is never shown a technical failure state — that would contradict "offer, never demand" and introduce alarm where none is warranted. (Persistent multi-day failure is surfaced elsewhere, gently, as part of the home screen — not as an error in this pill.)

## Content rules

- Exactly these three strings. Never "Synced ✓," never a percentage, never a technical word like "Uploading" or "Pending."
- The pill never says "Offline" as a warning — the app works fully offline by design, so there is nothing to warn about.

## Motion

- Entering "Syncing quietly": icon and ring cross-fade in over `base`.
- The breathing ring: opacity/scale loop, `3400ms`, holds while syncing continues. This is the one exception (with the voice waveform) to "nothing loops."
- Settling to "Synced": the ring's motion stops and the icon swaps to `check` with a `quick` cross-fade — deliberately undramatic, since the submit confirmation (see `CheckIn`) already carried the drama of "this is saved."
- **Reduced motion:** the ring does not breathe — it holds at a fixed partial opacity for the duration of syncing, then settles to the static check exactly as normal. The *state* change still reads clearly without any looping motion.

## Accessibility

- The pill is `role="status"` with `aria-live="polite"`, so a screen reader announces the change in state once, without interrupting whatever the person is doing.
- Never color-only: each state has distinct text, not just an icon/tone change.
