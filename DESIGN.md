# Design: Hacker-X Seismological Survey

A deadpan federal-survey bulletin about Hacker News clones. The joke works only if the instrument looks real, so the page borrows the conventions of seismology wholesale and plays them straight.

## World

- **Helicorder paper.** White paper, hairline divisions, one trace per line in the four drum pens, cycling in order: graphite `#1d2125`, red `#c62828`, blue `#1e4fbf`, green `#1b7a3e`. The pen color means "which line", never "which category". Big events spill onto neighbouring lines and clip, as they do on paper.
- **PAGER orange.** `#ff6600` (HN orange) appears only in the alert strip, the pen nib, the "you are here" flag, and text selection.
- **ShakeMap intensity.** The Mercalli chips use the USGS ShakeMap intensity colors, I through XII.
- **Ink.** Text `#15181c`, secondary `#434b54`, muted `#626b75`; rules `#d9dee3`; masthead band `#101214`.

## Type

- Public Sans (variable, self-hosted) for everything readable: display at weight 800–820, tracking -0.025 to -0.03em.
- Roboto Mono only for data: times, magnitudes, axis ticks, table values. Always tabular figures.

## Layout

- Two-column grid, 0.92fr : 1.5fr, carried through hero, section heads, faults and methods. A single column below 900px; on phones the hero drum follows the lede directly.
- Sections are separated by full-width hairlines, never cards. Tables are open, with a 2px ink rule under the header.

## Charts

- All charts are hand-drawn SVG from `data/events.json`. Observed data is red, model and forecast blue (validated pair), with lines 2px, a dashed forecast, and a 10% band.
- Every chart has a tooltip on hover and an equivalent in text: the catalog table is the drums' twin, and the forecast table is the chart's.

## Motion

One authored moment: the pen at "now" jitters and the paper advances in real time. It is off under `prefers-reduced-motion`.
