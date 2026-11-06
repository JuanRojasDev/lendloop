# LendLoop design notes

## Direction

- Power-tool yellow and black on warm neutrals. Yellow marks the one main action or the current place.
- Photography leads the catalog. Icons support it, they do not replace it.
- Signature details: the pegboard behind the public page and the price-tag hole on each tool.

## CSS approach

Based on Kevin Powell's "The New CSS Toolkit" workshop outline and his 2026 talk "Smart layout patterns with modern CSS".

- **Intrinsic layout first.** Grids size themselves with `auto-fill` and `minmax(min(100%, …), 1fr)`, so most layouts need no breakpoint.
- **`@container` for components.** A component responds to the space it has, not to the viewport. `@media` stays for page-level concerns: the sidebar, the tab bar, color scheme and motion preferences.
- **Subgrid for card rows.** Tool tags share row tracks, so names, status and actions line up across a row whatever the content length.
- **Fluid type and spacing.** `clamp()` for headings and gaps instead of per-breakpoint sizes.
- **Selectors instead of state.** `:user-invalid` for form errors after interaction, `:has()` for parent styling such as overdue loans.
- **Respect the cascade.** Normal flow, then flex and grid. No `position: absolute` for layout, only for decoration.
- **CSS before JavaScript.** Native `<details>` with `::details-content` and `interpolate-size` for the activity log, `field-sizing` and the `lh` unit for the description field, scroll snapping for the category chips, and media range syntax.
- **Progressive enhancement.** `sibling-index()` sets the stagger where it exists, behind `@supports`, with `:nth-child` as the fallback.
