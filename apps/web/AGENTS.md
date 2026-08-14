# apps/web

Landmines for the React app. Do not restate package layout or protocol shapes here — those belong in CodeGraph.

## Disclosure motion

Any open/close toggle (expand/collapse, show/hide, disclosure) must reuse `src/lib/disclosureMotion.ts`. Do not write bespoke height/opacity transitions or one-off `@keyframes` for a toggle. All toggles should feel identical: 220ms `ease-out`, with `motion-reduce` fallbacks.

- Shell + content: `disclosureShellClassName(open)`, `DISCLOSURE_INNER_CLASS`, `disclosureContentClassName(open)`, or `DisclosureRegion`.
- Base UI `<Collapsible>`: wrap with `CollapsiblePanel`.
- Chevron: `DisclosureChevron` / `disclosureChevronClassName(open)`.

Reference: project open/close and sidebar sections in `src/components/Sidebar.tsx`. If a toggle animates differently, migrate it.

## Transcript scroll

Treat auto-scroll as a live-output feature, not a generic "working" feature.

- Buffering, reconnecting, pending approvals, and tool-only activity must not be wired as if assistant text is streaming.
- Count real transcript messages only. Tool/work rows must not retrigger the "new content arrived" stick path.
- Prefer the simpler fork-style transcript path. Do not virtualize small or medium transcripts without a measured need.
- Never couple `rowVirtualizer.measure()` to another bottom-stick or height-follow cycle. Height-follow is one-way.
- Preserve these behaviors with focused transcript tests when changing chat scrolling, timeline measurement, or sidebar-driven transcript updates.
