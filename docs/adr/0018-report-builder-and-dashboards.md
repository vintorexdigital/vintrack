# 0018 Report builder, dashboards and scheduled reports

Status: accepted

## Decision
- **A report is a design, never SQL.** A person picks a *data source* (attendance, leave, expenses, tasks, leads, calls), up to three groupings, up to four numbers, conditions, a period and a look. Each of those is a key into the data source's allow-list in `modules/reports/datasets.ts`; the SQL is assembled from fixed fragments with every value passed as a parameter. Unknown keys, filters of the wrong type and over-long periods are refused when the design is saved and again when it runs.
- **Data scope is applied to every query, whoever built the report.** Each data source names the permission that governs it (`attendance.day.read`, `expenses.claim.read`, …) and the column that says whose row it is. A saved report opened by a manager shows that manager's reportees; the same report opened by an admin shows everyone. Dashboards run each widget as the person looking at it.
- **Saved reports and dashboards** are CRUD kits (`saved-reports`, `dashboards`) with visibility `private` (only the maker) or `company` (everyone who can read reports). Only the maker, or someone with company-wide update rights, may change or delete a shared one. A dashboard may only use reports its maker can open.
- **Charts** are plain HTML and SVG in `packages/ui` (bars, line, donut, big number). Every value is printed, a "Show the numbers" table sits under each chart, and colours come from the palette tokens, so colour is never the only cue. No chart library.
- **Scheduled reports** go to the person who scheduled them, one schedule per person per report. When due, the report runs *as that person* (their roles, their scope) and the result is stored as a snapshot (up to 2,000 rows, kept 90 days) and announced in-app and on their chosen channels with a link. Delivery to other people is deliberately not built: a copy made with one person's scope would show another person data they may not see.
- The builder is behind the `advanced_analytics` module; the nine standard reports remain available on every plan.

## Not built
Joins across data sources, calculated fields, pivot tables, drill-down, comparing periods, dashboard filters, email attachments, sharing snapshots, custom SQL, the productivity/location datasets (location is sealed; see ADR 0013).
