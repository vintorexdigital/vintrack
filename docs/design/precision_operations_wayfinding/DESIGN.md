---
name: Precision Operations & Wayfinding
colors:
  surface: '#f7f9ff'
  surface-dim: '#d1dbe9'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#edf4ff'
  surface-container: '#e4effd'
  surface-container-high: '#dfe9f7'
  surface-container-highest: '#d9e3f1'
  on-surface: '#121c26'
  on-surface-variant: '#40484c'
  inverse-surface: '#27313c'
  inverse-on-surface: '#e8f2ff'
  outline: '#70787c'
  outline-variant: '#bfc8cc'
  surface-tint: '#1d667b'
  primary: '#004556'
  on-primary: '#ffffff'
  primary-container: '#0f5e73'
  on-primary-container: '#95d5ee'
  inverse-primary: '#8fd0e8'
  secondary: '#815500'
  on-secondary: '#ffffff'
  secondary-container: '#fdaf23'
  on-secondary-container: '#6a4500'
  tertiary: '#33414d'
  on-tertiary: '#ffffff'
  tertiary-container: '#4a5865'
  on-tertiary-container: '#bfcedd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b6eaff'
  primary-fixed-dim: '#8fd0e8'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#004e60'
  secondary-fixed: '#ffddb2'
  secondary-fixed-dim: '#ffb94d'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#624000'
  tertiary-fixed: '#d5e4f4'
  tertiary-fixed-dim: '#bac8d7'
  on-tertiary-fixed: '#0f1d28'
  on-tertiary-fixed-variant: '#3a4855'
  background: '#f7f9ff'
  on-background: '#121c26'
  surface-variant: '#d9e3f1'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  metric-display:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  time-tabular:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: '0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for industrial-grade operational monitoring, workforce transit management, and high-density telemetry. The emotional resonance is rooted in the quiet authority, discipline, and legibility of classic railway cartography and transit dispatch consoles: reliable, unerringly legible, rigorously aligned, and calm under high cognitive load.

The interface moves away from consumer SaaS fluff—there are no decorative gradient washes or bloated, airy cards. Instead, it adopts a Swiss-inspired utilitarian architecture: clear structural rules, continuous data ribbons, tabular numerical alignment, and deliberate accent colors that immediately communicate status, time delta, and operational health. The system serves technical dispatchers, operations managers, and field supervisors who need to parse high volumes of dense personnel and route data across split-second intervals.

## Colors

The palette is anchored in an editorial-instrumental aesthetic, pairing a tactile, low-fatigue warm background with authoritative deep inks and crisp tectonic rules.

### Core Canvas & Structure
- **Paper (`#F6F7F3`)**: Serves as the global backdrop canvas. It softens eye strain during 12-hour operational shifts while preserving contrast.
- **Surface (`#FFFFFF`)**: Pure light reflection for operational workbenches, tabular registers, flyout sheets, route timelines, and actionable cards.
- **Rule (`#E2E5DF`)**: The architectural backbone. Defines grid walls, table dividers, column tracks, and time-slot axes without visual pollution.

### Text & Neutral Signals
- **Ink (`#17212B`)**: Primary text, key figures, table headers, and structural high-contrast icons.
- **Slate (`#52606D`)**: Secondary metadata, time units, column categories, deactivated actions, and muted telemetry icons.

### Brand & Telemetry Accents
- **Petrol (`#0F5E73`)**: The primary locus of control. Used for primary execution buttons, current tab selections, active route segments, focal keyframe highlights, and text links.
- **Marigold (`#F2A516`)**: The dynamic temporal accent. Reserved strictly for real-time states: live tracking markers, the ticking vertical "now" time ribbon, active punch beacons, and unsynced state alerts.

### Status Indicators (Strict Semantics)
- **Present / Productive (`#1B7F45`)**: Verified check-ins, active duty, optimal route performance.
- **Absent / Unproductive (`#C8372D`)**: Critical exceptions, unexcused gaps, missed waypoints.
- **Leave (`#9A6414`)**: Approved absence, standard duty rotation out-of-office.
- **Late / Policy Mark (`#B8501F`)**: Time breaches, shift bleed, compliance warnings.
- **Holiday (`#6D5BD0`)**: Calendar exclusions, statutory breaks.
- **Non-working (`#6B7580`)**: Inactive schedule blocks, resting machinery, off-shift hours.
- **Pending (`#2B6CB0`)**: Sync in-flight, unconfirmed approvals, scheduled verification.

## Typography

The typography is built around clean structural discipline, exceptional micro-legibility at compact scales, and strict horizontal metric predictability.

- **Tabular Numerals (`font-feature-settings: "tnum" 1` / `font-variant-numeric: tabular-nums`)**: Mandatory on all time stamps, duration markers, GPS coordinates, personnel counts, and delta meters. This prevents layout jitter during real-time updates and ensures column totals align precisely along vertical decimal coordinates.
- **Hierarchy & Scale**: The system uses a disciplined type scale, eschewing oversized editorial display types. Primary visual weight is modulated through weight (`500` vs `600`) and value (`Ink` vs `Slate`) rather than exponential size steps.
- **Labels & Micro-data**: Table columns, station markers, and badge metadata employ uppercase or tight sentence-case styling with widened tracking (`0.04em`) to ensure instant recognition at `11px` (`0.6875rem`).

## Layout & Spacing

The layout philosophy mirrors transit system track grids and architectural schedules. Space is treated as a finite, precious surface; padding is compact, intentional, and compact enough to support continuous 100+ row data sets without excessive scrolling.

- **The Workbench Grid**: A fluid 12-column foundation with a tight base grid (`4px`). The canvas uses a default inner gutter of `12px` (`0.75rem`), locking dense modular inspectors, route lists, and schedule panels into a continuous matrix.
- **Section Breaks & Nesting**: Components sit flush against structural Rule borders (`#E2E5DF`) rather than relying on wide interstitial margins. Information containers transition seamlessly from panel to panel.
- **Breakpoints & Form Factors**:
  - **Desktop (>= 1280px)**: Persistent dual-pane or multi-column operational layout. Left schedule roster (320px fixed), center timetable matrix (fluid), right waypoint/personnel inspector (360px fixed).
  - **Tablet / Operational Console (768px – 1279px)**: Inspector collapses into a slide-over drawer; timetable ribbons remain horizontally pannable with sticky identity columns.
  - **Mobile (< 768px)**: View drops to single-column card feeds with segmented control switches between Schedule, Map, and Action Logs.

## Elevation & Depth

This design system rejects diffuse, floating shadows in favor of **Tonal Surface Separation and Low-Contrast Structural Rules**.

- **Level 0 (Global Track)**: Background `Paper` (`#F6F7F3`), flat, non-elevated.
- **Level 1 (Structural Modules & Registers)**: `Surface` (`#FFFFFF`) bound by a strict 1px solid `Rule` border (`#E2E5DF`). No shadow. Depth is communicated strictly via plane contrast between white operational modules and warm paper gutters.
- **Level 2 (Pinned / Active Elements)**: Pinned row headers, locked timeline axes, and active time-ribbon blocks receive a subtle edge accentuation: `border: 1px solid #E2E5DF; box-shadow: 0 1px 2px rgba(23, 33, 43, 0.04)`.
- **Level 3 (Flyouts, Modal Registers, Popovers)**: Context menus and inspection flyouts use clean structural containment: `border: 1px solid #E2E5DF; box-shadow: 0 4px 16px -2px rgba(23, 33, 43, 0.08)`.

## Shapes

The geometry follows industrial hardware consoles: crisp, structured, and space-efficient.

- **Global Baseline**: `4px` (`0.25rem`, `roundedness: 1`) on standard containers, action buttons, table cell segments, and input boxes. This avoids the visual waste and loose corners of pill shapes while maintaining subtle softness against sharp 90-degree table grids.
- **Chips & Badges**: Retain the `4px` perimeter or step down to `2px` for micro-table status chips. Pill styling is strictly prohibited except for isolated, active multi-avatar stacks.
- **Day-Ribbon Blocks**: Edge radius is capped at `2px` on interior schedule segments to ensure abutting time-blocks merge cleanly like segments of a rail track.

## Components

### Buttons
- **Primary**: Solid Petrol (`#0F5E73`) background with `#FFFFFF` text. Hover: `#0C4B5C`. Active: `#0A3C4A`. Height: `32px` (compact) or `36px` (default). Padding: `0 12px`. Crisp 4px border radius.
- **Secondary / Outline**: `#FFFFFF` background with 1px solid Rule (`#E2E5DF`) border, Ink (`#17212B`) text. Hover: `#F6F7F3` background, border `#52606D`.
- **Destructive**: `#FFFFFF` background with 1px solid `#C8372D` border and text. Hover: `#C8372D` solid with `#FFFFFF` text.

### Badges & Operational Status Chips
- **Construction**: 1px solid border matching a 20% alpha tint of the status color, a tinted 10% opacity background, and solid status color text (`font-weight: 600`, `font-size: 11px`, tracking `0.04em`).
- **Live State Badge**: Features a pulsing `6px` solid Marigold (`#F2A516`) circle indicator next to tabular uppercase text (`LIVE PUNCH`).

### Data Tables (Timetable Grid)
- **Header**: Height `32px`, `Paper` background (`#F6F7F3`), lower border 1px solid `Rule` (`#E2E5DF`), text in `Slate` (`#52606D`), uppercase 11px bold.
- **Row**: Height `36px` (compact) or `44px` (standard), alternating zebra row disabled; cell separators use 1px horizontal `Rule`. Hover state triggers `#F6F7F3` surface highlight.
- **Numbers & Coordinates**: Enforced tabular numerals (`tabular-nums`), right-aligned.

### Day-Ribbon Time Blocks
- **Architecture**: Horizontal continuous tracking bar representing shifts and duty cycles across a 24-hour horizontal scale.
- **Block Fill**: Segmented by status color (e.g., `#1B7F45` for active duty, `#9A6414` for leave, `#6B7580` for non-working). Height is fixed at `20px` to `24px` with a 1px vertical gap dividing discrete intervals.
- **The "Now" Indicator**: An absolute-positioned, 2px vertical hairline rendered in Marigold (`#F2A516`), crowned with an inverted `6px` Marigold triangle at the timeline axis header, continuously recalculating position.

### Input Fields & Controls
- **Text Inputs**: Height `32px`, Surface (`#FFFFFF`) fill, 1px solid Rule (`#E2E5DF`) border, Ink (`#17212B`) text. Focus: 1px solid Petrol (`#0F5E73`) with zero spread shadow.
- **Checkboxes & Radios**: 14px square/circle with 1px solid `Slate` (`#52606D`). Checked state fills with Petrol (`#0F5E73`) displaying an inset pure-white checkmark.