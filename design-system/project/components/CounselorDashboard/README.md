# CounselorDashboard

What a counselor sees. The single rule this screen exists to enforce: **a counselor reads reasons, in plain words — never a score, never a raw number about a person.** Everything else in this layout serves that rule.

## Anatomy

1. **Summary strip** — counts of *people*, never scores: "People checking in," "Need attention," "Reached out today." No tile ever shows an average, a percentile, or a number that isn't a count of people or days.
2. **Alerts / People tabs.**
3. **Filter chips** — All, Reach out today, Reach out this week, Keep an eye on. These are the only three severity words that exist anywhere in this UI.
4. **Severity-sorted queue** — most urgent first. Each row: who, how long ago, a one- or two-sentence plain-English reason, and small tags naming *which kinds of signal* contributed ("their own answers," "the words they chose," "timing of check-ins") — never a number for any of them.
5. **Acknowledge** collapses a row with Undo available for a few seconds — acknowledging is never silently permanent.
6. **Detail panel** — the full reason, "what they told us" (their own words, only ever shown because they chose to share them — stated explicitly), case context, and the trend chart.
7. **Trend chart** — a line against the person's **own usual range**, shown as an ice band — never against any other person, never against a population average. The vertical axis reads "Lighter" / "Heavier" in words; there is no numeric axis anywhere. Hovering or using arrow keys moves a guide line and a tooltip that states, in words, whether that day was lighter, within, or heavier than usual.

## Content rules

- "Reach out today / this week" and "Keep an eye on" read as instructions a counselor can act on — never "HIGH," "MEDIUM," "LOW," never a traffic-light label alone.
- A reason is always a sentence a counselor could repeat back to a supervisor without translation: *"Wrote about feeling unsafe at night, and has slept poorly for 4 days in a row."*
- A shared note always states its own consent in the same breath it's shown: *"Notes appear only because Meera chose to share them with you."* A note is never shown without that sentence beside it.
- Numbers appear only as **days, dates, and case IDs** — e.g. "4 days in a row," "raised 29 Sept," "DEMO/1042/2026." Never as a score, percentage, or chart value.

## States

- Queue: empty / loading / populated, each severity tier, acknowledged (collapsing), a live incoming alert arriving mid-session.
- Detail: a person with enough history for a trend vs. one too new to have a baseline yet (shown as "Not enough check-ins yet to compare," never a chart with a missing axis).

## Motion

Rows fade+rise in with a severity-ordered stagger on load. Acknowledge collapses the row's height and fades it; the Undo toast slides up and, on Undo, the restored row gets one soft flash — never a bounce. A new incoming alert expands into place with the same one-flash treatment. Summary tiles count up once, on load, from zero to their value. The trend line draws in over `draw`; the baseline band eases open just before it; points appear along the stroke as it goes.

## Accessibility

- Minimum tap target here is `touch-min-counselor` (44px) — this is the one screen in the system allowed the denser target, since it's used by trained staff at a desk, not someone checking in on the move.
- The trend chart is fully operable by keyboard: arrow keys move the same guide line and tooltip that hover does; the tooltip text is the same whether reached by mouse or keyboard.
- Severity tags are never color-only — each carries its instruction text ("Reach out today") alongside the tag color.
