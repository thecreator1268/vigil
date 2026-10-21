# Explainer

The five-step first-run walkthrough. Its job is narrow and important: before anyone is asked to say anything about themselves, they should understand exactly where that goes — and that they can stop, skip, or say nothing, at every step.

## The five steps

1. **Check in your way** — tap, write, or speak. Whatever's easiest today.
2. **Understood on your phone** — your words are read on this device, not sent off to be read by a person or a server.
3. **Saved here first** — nothing leaves until it's saved on your phone.
4. **You decide what leaves** — nothing is shared without your say-so, ever.
5. **Counselors read words, not scores** — if something is shared, a person reads what you wrote in plain English. No one sees a number about you.

Steps 2–5 exist specifically to pre-empt the fears most likely to keep someone from being honest: *is this being watched, is this being judged, can I take it back.* Every step answers one of those directly, before the person has given anything.

## Anatomy

- A one-time, hold-still diagram per step (see Motion), built from `IconCircle` and simple connecting shapes — never a photo, never an illustrated character.
- One heading (`title`), one or two short sentences (`body`).
- Step dots, not a progress bar with a percentage — this is a short walkthrough, not a task with a deadline.
- **Skip** is available from step one, top right, same weight as any other skip in the app.
- Back/Next; the final step reads **"Get started,"** not "Finish" or "Done."
- The crisis entry is present here too — a person can be in crisis before they've even opened the app's main flow.

## Content rules

- Each step is one idea. If a sentence needs "and," it's probably two steps' worth of content.
- No step asks for anything — no name, no permissions prompt stacked onto an explainer step. Permission requests (if any) happen later, in context, when they're actually needed.

## States

- Step 1–5, Skip (exits anywhere), and a completed state after "Get started."

## Motion

Each diagram animates once on arrival — icons settle in with a short stagger, any connecting line draws once — then holds completely still. **It never loops, never idles, never re-triggers on revisiting a step within the same session.** Step transitions use `base` with `ease-in-place`, sliding the way `CheckIn`'s questions do.

## Accessibility

- Step dots have an accessible name ("Step 2 of 5") rather than relying on visual position alone.
- Diagrams are decorative (`aria-hidden`); the same information is always present as text.
