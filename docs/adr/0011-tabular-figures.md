# 0011. Tabular figures come from Inter, not Anek

Status: accepted. Resolves the follow-up in ADR 0001.

## Finding
The design system calls for Anek with tabular figures in tables, KPIs and timers. Measured in a browser, Anek Latin has no `tnum` feature: with `font-variant-numeric: tabular-nums` the string "1111" is 43 px wide and "8888" is 71 px (at 32 px), so columns of numbers do not align. The base style also set `font-feature-settings: 'tnum' 0` on `body`, which would have overridden `font-variant-numeric` even for a font that had the feature.

## Decision
`packages/tokens/css/figures.css` declares a `Trackrex Figures` font face from Inter (SIL OFL, license in `fonts/`), restricted by `unicode-range` to digits and the punctuation used in numbers and money. In numeric contexts (`.tabular-nums`, table cells) the family list starts with it and `font-feature-settings: 'tnum' 1` is set explicitly. Everything else, including all text and all non-Latin scripts, stays in Anek.

## Verification
`apps/web/e2e/typography.spec.ts` loads the font in a real browser and asserts that "1111" and "8888" have identical width in a tabular context (83 px both) while proportional text differs.

## Consequences
Digits in tables are Inter-shaped, a small visual departure from the Anek specimen that the design brief did not anticipate. Cost is one 48 kB font file, fetched only when digits render. If a tabular-capable Anek build appears, delete `figures.css` and the test will fail until the family list is restored, which is the intent.
