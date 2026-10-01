# Trackrex screenshot analysis: all 117 images in trackwick.zip

Companion to `trackrex-master-prompt.md`. Keep both files together in `docs/` so the coding agent can cross-reference screen numbers (the master prompt cites them as "ref N").

## What the set is

The 117 images are full-screen desktop captures (about 2560 x 1260, Windows, Chrome) of one manager/admin account inside an existing workforce-management and employee-tracking SaaS. The footer credits the underlying vendor (TrackOlap, build 2.6.616). The account belongs to a small agency tenant with 16 active employees on two license bundles, one for field sales staff and one for desktop/office staff.

They were captured in three sessions:

| Session | Images | Focus |
|---|---|---|
| 19 Aug 2026, 15:51 to 19:40 | 1 to 32 | Home, analytics dashboards, desktop productivity, timesheets, employees, tasks, customers, expenses, leave, attendance |
| 20 Aug 2026, 15:52 to 15:58 | 33 to 44 | Feed, call log, raw activity, projects, reports, location analytics, contacts, organization details |
| 29 Aug 2026, 09:51 to 10:11 | 45 to 117 | The entire Admin area: org setup, shifts, policies, leave rules, form and workflow builders, 16 settings pages, billing, module switcher, profile menu |

Privacy note: the screenshots contain real employee names, phone numbers, personal emails, customer business names and GPS positions. None of that is reproduced here or in the master prompt; screens are described by structure and field names only.

## Coverage map

| Area | Images |
|---|---|
| Home widget dashboard | 1 |
| Analytics dashboards (Summary, Task, Call log, Desktop activity, App usage, Website usage) | 2 to 10 |
| Desktop insights (day view, timeline, team productivity, screenshots, applications) | 11 to 17 |
| Timesheets | 18 |
| Employees | 19 |
| Tasks and recycle bin | 20, 21 |
| Customers | 22 |
| Expenses and recycle bin | 23, 24 |
| Leave (list, balance, calendar) | 25 to 28 |
| Attendance (daily log, monthly register, regularization approvals) | 29 to 32 |
| Activity feed | 33 |
| Call log and ignore list | 34, 35 |
| Raw employee activity | 36 |
| Projects | 37, 38 |
| Report catalog | 39, 40 |
| Location analytics and shared analytics | 41, 42 |
| Contacts | 43 |
| Admin: organization and employee setup | 44 to 52 |
| Admin: working shifts (list, detail, employees, audit, policies) | 53 to 59 |
| Admin: email templates and email audit | 60 to 62 |
| Admin: app and website classification, break types | 63, 64 |
| Admin: form builder and custom fields | 65 to 70 |
| Admin: workflows and notifications | 71 to 73 |
| Admin: attendance policies | 74, 75 |
| Admin: leave profiles, leave types, holidays, non-working days | 76 to 86 |
| Admin: account settings (16 sections) and audit | 87 to 110 |
| Admin: geo-fences, billing, tools | 111 to 115 |
| Global UI: module switcher, profile menu | 116, 117 |

## Cross-cutting patterns

**Shell.** A single horizontal top bar carries 18 module links (Home, Dashboard, Desktop Insights, Timesheet, Employee, Team Task, Customers, Expense, Leave, Attendance, Feeds, Call Log, Employee Activity, Project, Reports, All Analytics, Contacts, Admin), several with dropdowns. The right side holds a punch widget (fingerprint icon, "Punched Out", time since last punch), a role label ("Manager") and an avatar. A red subscription-renewal banner sits under the bar on nearly every screen, for every user. The footer shows vendor credit, version, privacy and terms links, and "Take tour again".

**Page header.** Every page opens with an icon tile, module name and sub-view name, then right-aligned actions: primary button (Add X), export icons (Excel, CSV), column settings, filter, back, refresh.

**Filters.** Filters are field-plus-operator chips ("Employee (Equal)", "Customers (In)"), date presets (Today, Yesterday, Last 7 days, Month to date), a leave "Session" selector (Jan-26 to Dec-26) and a "Direct reportees only" toggle. The map screen offers "Set as default" for filters.

**Tables.** Sortable columns, checkbox selection, avatar plus online/offline dot next to employee names, "Load more", "50 / page" and a separate "Fetch total" button so large totals are only counted on demand. Human-readable codes are everywhere (employee E-nn, customer CUST-nnn, task CHK-nnn), but an internal database ID column is also exposed on customers and licenses.

**Soft deletes.** Tasks, expenses and employees have recycle bins; tasks are purged 30 days after deletion; deleted employees can be restored and still appear as "Name (Deleted)" in created-by columns.

**Configuration style.** Admin pages use a second left sidebar of about 25 entries with collapsible groups. Settings pages are long walls of toggles, each with an info icon, split into 16 sections. Configuration objects (shifts, leave types, policies) have their own tabbed detail pages with an Audit history tab.

**No-code layer.** One drag-and-drop form builder with about 35 field types is reused for task forms, expense forms, check-in forms and custom fields on employees, customers and contacts. A node-based workflow designer drives approvals. Notifications are rule-based.

**Licensing.** Seats are sold per bundle of modules ("Sales + call log" with Basic, Tracking, Attendance, Leave, Expense, Task, Call log; "Desktop" with Basic, Attendance, Leave, Activity), each showing total versus consumed seats.

## What the screenshots do not show (filled in by the master prompt)

The mobile app, the desktop agent's own UI, the browser-tracking mechanism, the vendor's operator/billing back office, signup and marketing pages, the public API, notification content, the analytics builder's editing surface, and report outputs. Many admin lists were empty (departments, designations, holidays, geo-fences, policies, email templates), so their create forms are inferred from column headers.

## UX problems worth not copying

The 18-link top bar is overloaded and truncates on smaller screens; a grouped sidebar with a command palette scales better. The billing banner is shown permanently to every user, including those who cannot pay. Internal database IDs are shown in list views. Settings are long toggle walls without search, grouping by intent, or "changed from default" markers. Naming is inconsistent ("Team Task" vs "Tasks", "Calllog", "Tags" meaning custom fields). Home, Dashboard and Desktop Insights overlap heavily. Most empty states are a grey icon with "No data found" and no next step. The tracking agent's own window is counted as a top "productive" application in usage stats.

## Image-by-image analysis

Captured times come from the file names (Screenshot YYYY-MM-DD HHMMSS).

| # | Captured | Screen | What it shows | What it means for the build |
|---|---|---|---|---|
| 1 | 19 Aug 15:51 | Home, Summary | Widget board: Attendance (present, absent, on leave with % rings), Action needed today (pending, overdue, upcoming tasks), Task (completed, in progress), Birthdays, Holidays, Expense, Productivity (total %, working, productive, idle, bar chart), Timesheet activities and breaks. Edit, Select dashboard, Add widgets, fullscreen, refresh. | Widget registry with per-widget date scope; draggable, resizable grid saved per user; multiple named dashboards. |
| 2 | 19 Aug 15:51 | Dashboards, Summary | Left tab rail (Summary, Task, Call log, Desktop activity, App usages, Website usages). KPI strip with period-over-period deltas: distance km, travel time, tasks, employee-present days, working hours. Daily distance area chart; per-employee table. | Daily rollup tables that power KPIs and deltas; operator filter chips. |
| 3 | 19 Aug 15:51 | Dashboards, Summary (scrolled) | Remainder of employee table plus a live Breaks table: current break type, total break minutes, "Exceeded by N min" or "Available N min" against a 60-minute allowance, last break start, work duration so far. | Per-shift break allowance and real-time break compliance. |
| 4 | 19 Aug 15:51 | Dashboards, Task | KPIs (completed, time spent, unique customers), completed-per-day chart, Top performing employees, Task activity by visit type, Completed tasks by type. | Task analytics by task type/form and by employee. |
| 5 | 19 Aug 15:56 | Dashboards, Task (one employee) | Same tab filtered to a single employee: Pending tasks by type till today (empty), Top customers by completed visits and time spent. | Every dashboard accepts employee filters; customer-level aggregates. |
| 6 | 19 Aug 15:56 | Dashboards, Call log | KPIs for outgoing and incoming counts and durations with deltas; outgoing-per-day chart; per-employee call table. | Call rollups per employee per day from synced call logs. |
| 7 | 19 Aug 15:57 | Dashboards, Desktop activity | KPIs for total and average working, productive and idle hours; team working-time, idle-time and productive-time trend charts; "Employee with most unproductive time" list. | Desktop productivity rollups; unproductive time derived from app/site classification. |
| 8 | 19 Aug 15:57 | Dashboards, Desktop activity (scrolled) | Date-wise table of team working, idle and productive hours for the month. | Daily team aggregates with export. |
| 9 | 19 Aug 15:57 | Dashboards, App usages | Grouped daily bars for the top 3 apps, top-3 donut, Top 50 application table with duration and share bars. The tracking agent's own window ranks among the top apps. | App usage aggregation; exclude the agent's own process from stats. |
| 10 | 19 Aug 15:57 | Dashboards, Website usages | Same layout for domains (documents, web messaging, ad managers, AI chat, social sites). | Domain-level website tracking, which needs a browser extension or OS accessibility API. |
| 11 | 19 Aug 15:57 | Desktop insights, Summary | One employee, one day: punch in, punch out, working, productive, idle, productivity %, activity duration; weekly analytics with daily % bars; per-minute productivity timeline; activity-versus-break timeline. | The employee day view, the basis for the "day ribbon" component in the new design. |
| 12 | 19 Aug 15:58 | Desktop insights, Summary (scrolled) | Most-used applications and websites with productive/unproductive colour coding; hour-wise productivity chart; start of hour-wise screenshots with a blur-level selector ("Low level"). | Screenshot blur levels; hour-level productivity. |
| 13 | 19 Aug 15:58 | Desktop insights, Summary (screenshots) | Screenshot gallery grouped by hour with timestamps under each thumbnail. | Screenshot storage, thumbnails, per-hour grouping, lightbox. |
| 14 | 19 Aug 15:58 | Desktop insights, Timeline | All employees on one Gantt-style chart with in, out, working and productive columns and coloured activity bars across the day; timezone selector (GMT+05:30); pagination. | Team timeline with timezone switch. |
| 15 | 19 Aug 15:59 | Desktop insights, Team productivity | Per-employee working, unrecorded, recorded, idle, productive time and productive % bars; overall team productivity; average idle and productive time trend charts. | Precise definitions for working, recorded and unrecorded time (agent offline or not installed). |
| 16 | 19 Aug 15:59 | Desktop insights, Screenshots | Employee list with online dots on the left; hour-grouped screenshot grid on the right; date and blur controls. | Team screenshot browser. |
| 17 | 19 Aug 15:59 | Desktop insights, Applications | Per-employee app stats: top-3 apps stacked by hour, donut, application table. | Per-employee app drill-down. |
| 18 | 19 Aug 16:00 | Timesheet, All timesheets | Daily timesheets per employee with code, date, submitted on, number of activities and status (all "Draft"); Last 7 days filter. | Timesheet lifecycle (draft, submitted, approved, rejected) and submission reminders. |
| 19 | 19 Aug 17:08 | Employee, All employees | Header counters (All, In, Out, Never, Late, Leave); toolbar with search, import, export and bulk actions; columns for name, manager, identity code, department, email, designation, mobile, working shift and live status ("In, 7 hours ago"). | Employee directory with live punch status, bulk operations and import. |
| 20 | 19 Aug 19:38 | Team task, Customer tasks | Task list with checkboxes: code (CHK-nnn), employee, identity, work location, designation, department, priority, status, stage, type. Load more, 50 per page, Fetch total. | Prefixed task codes, kanban stages, on-demand total count. |
| 21 | 19 Aug 19:38 | Tasks, Deleted tasks | Recycle bin with a notice that tasks are permanently deleted 30 days after deletion; deleted on, deleted by, deletion reason. | Soft delete with reason and scheduled purge. |
| 22 | 19 Aug 19:38 | Customers, All customers | Code (CUST-nnn), mobile, email, status, owner, reporting managers 1 and 2, created on, created by (some shown as deleted employees), internal DB ID. | Customer ownership and two-level visibility; preserve creator references; hide internal IDs. |
| 23 | 19 Aug 19:38 | Expense, All expenses | Empty list with columns title, ID, employee, team, work location, type, status, claimed, approved, comment, status updated. | Claimed versus approved amounts driven by a workflow. |
| 24 | 19 Aug 19:39 | Expense, Deleted expenses | Empty recycle bin with the same columns. | Expense recycle bin. |
| 25 | 19 Aug 19:39 | Leave, All leaves | Empty list with session selector and "Direct reportees only" toggle; columns type, employee, team, work location, status, day, from, to, work date, duration. | Leave session (leave year) concept and reporting-line scope toggle. |
| 26 | 19 Aug 19:39 | Leave, list (approval variant) | Same list with "Action on" and "Action by" columns. | Approval audit trail on leave requests. |
| 27 | 19 Aug 19:39 | Leave, Leave balance | Employee, leave type, balance, leave session, date/time. | Balance ledger per session. |
| 28 | 19 Aug 19:39 | Leave, Monthly view | Month calendar with applied, pending and approved counters; right-hand filter panel (status, employees, leave types, leave profile, departments, team) and a toggle to show holidays and non-working days. | Team leave calendar with filters. |
| 29 | 19 Aug 19:39 | Attendance, All attendance | Daily punch log: employee, team, work location, date, in time and source ("Self") with map and selfie icons, out time and source. | Punch records carrying source, geo and selfie evidence. |
| 30 | 19 Aug 19:40 | Attendance, Monthly attendance | Register grid for days 1 to 31 with coded, coloured cells; summary columns P, A, L, HL, H, PA, HP, AH, AP, D, NW; desktop-app sync status under each name ("Last sync 15 minutes ago", "Never login desktop app"); attendance cycle label; colour legend. | Monthly register driven by policy outcomes and overrides, with configurable symbols and colours. |
| 31 | 19 Aug 19:40 | Attendance, Pending approvals | Regularization requests: employee, duration, date, current status (Absent), requested state (Full day), created on, Take action. | Regularization workflow. |
| 32 | 19 Aug 19:40 | Attendance, Monthly (single employee) | Same register for one person, with the full legend visible: half-day present, late mark, overridden to non-working day, not joined, late mark per policy, present, overridden to absent, absent, half-day leave, non-working, full-day leave, deductions, approved present, pending unpaid leave, pending approval, overridden to holiday, holiday. | Complete status taxonomy (master prompt Appendix C). |
| 33 | 20 Aug 15:52 | Feeds, Record | Chronological event feed: punched in, punched out, task started, task completed, auto punch out; platform (Android, Desktop, System), IMEI, date/time. | Event stream as a first-class feature, including system actions. |
| 34 | 20 Aug 15:53 | Call log, Team call log | Number, customer/lead, type (outgoing, incoming, missed, rejected), duration, start time, employee, recording flag, created on. | Android call sync with number-to-customer matching. |
| 35 | 20 Aug 15:53 | Call log, Ignore list | Country code, number, creator, created on, action; add button. | Excluded numbers that are never synced. |
| 36 | 20 Aug 15:53 | Employee activity | Raw agent samples: mouse clicks, mouse moves, key-down counts, duration (2 to 10 minute buckets), screenshot link, platform (win32), OS type. | Activity ingestion in time buckets, counts only. |
| 37 | 20 Aug 15:54 | Project, All projects | Title, activities, status, self created, created; Add project. | Projects with activities used by timesheets. |
| 38 | 20 Aug 15:55 | Project, All projects (variant) | Same list with CSV export and activity count. | Export on every list. |
| 39 | 20 Aug 15:55 | Reports, Template | Left rail (Template, My report, Shared, Team report, Requested report); catalog by category with counts: Productivity and activity (21), Task (11), Travel (8), Attendance; each report has a description (DSR daily activity report, daily productivity, distance, geo points, distance by employee, stoppage of 10 minutes or more). | Report template registry plus async "requested" reports. |
| 40 | 20 Aug 15:55 | Reports, Template (scrolled) | Employee master (6: joining, exit, active, deleted), Leave (6: leave status, compensatory leaves, pending approval), Expense (5: expense, pending approval, approved, stage-wise audit), Call log. | About 70 templates across categories (master prompt Appendix B). |
| 41 | 20 Aug 15:56 | All analytics, Location analytics | Control panel with counts (employees, customers, branches, tasks), filters with "Set as default", employee location type (Home, Current, Base), layer toggles (Employee, Customers, Branch, Task) with per-layer filters; map with clustered markers. | Layered live map with saved default filters. |
| 42 | 20 Aug 15:57 | All analytics, Shared with me | Folder list (Default folder), analytics-type filter, empty state. | Analytics builder with folders and sharing. |
| 43 | 20 Aug 15:57 | Contacts | Name, contact links (to customers), country code, mobile, email, designation, created; 352 records. | Contacts linked to one or more customers. |
| 44 | 20 Aug 15:58 | Admin, Organization details | Organization name, company name, vendor account manager, support contact, "Support access" toggle; admin sidebar. | Tenant profile plus a consent switch for vendor support access. |
| 45 | 29 Aug 09:51 | Admin, Work locations | Empty list with Add work location; Employee's setup group expanded. | Work locations (branches) with geo data. |
| 46 | 29 Aug 09:51 | Admin, Departments | Title, status, designations, parent, head of department, created by, created on, action. | Department hierarchy with heads. |
| 47 | 29 Aug 09:52 | Admin, Designations | Title, status, department, created by, created on. | Designations tied to departments. |
| 48 | 29 Aug 09:52 | Admin, Employee type | Title, created. | Lookup list. |
| 49 | 29 Aug 09:52 | Admin, Business unit | Title, created. | Lookup list. |
| 50 | 29 Aug 09:52 | Admin, Cost center | Title, created. | Lookup list, useful for expense allocation. |
| 51 | 29 Aug 09:52 | Admin, Employment type | Title, created. | Lookup list (full-time, contract, intern). |
| 52 | 29 Aug 09:53 | Admin, Employee audit | Empty audit table. | Field-level audit of employee records. |
| 53 | 29 Aug 09:53 | Admin, Working shifts | Two shifts (Sales, Desktop) with max punch-in time, working hours and auto punch-out time. | Shifts anchor all attendance rules. |
| 54 | 29 Aug 09:53 | Working shift, Detail | Title, working hours, break hours, start time, max punch-in time, timezone, continuous idle time, break-mark platform permissions, login platform restrictions; auto punch-out based on hours (12); block punch after auto punch-out; attendance regularization; restrict punch-in before period. | Shift rule schema (master prompt 5.4). |
| 55 | 29 Aug 09:53 | Working shift, Detail (scrolled) | Punch sources (app, desktop, web); punch restrictions (mandatory in/out comment, IP address, restrict after max punch-in time, restrict at home location); app punch without location and selfie; selfie mandatory with date/time watermark; location mandatory with address watermark. | Punch validation pipeline. |
| 56 | 29 Aug 09:53 | Working shift, Detail (scrolled) | Timesheet restriction (hide past break, hide past activity, restrict punch-in); mobile restriction (IMEI lock, fingerprint enable and force, punch-in required, check-out required, punch-out mandatory for logout); geo-fence restriction for punch in and out; Update. | Device binding and geo-fence enforcement. |
| 57 | 29 Aug 09:54 | Working shift, Employees | Employees assigned to the shift with add and remove. | Effective-dated shift assignments. |
| 58 | 29 Aug 09:54 | Working shift, Audit history | Action, old value, new value, action by, date/time ("Employee added" rows). | Audit on every configuration object. |
| 59 | 29 Aug 09:54 | Working shift, Attendance policy | Attached policies (name, start date, end date); empty. | Policy-to-shift linkage. |
| 60 | 29 Aug 09:55 | Admin, Email templates | Name, subject, status, created; empty with Add template. | Tenant-editable templates with variables. |
| 61 | 29 Aug 09:55 | Admin, Email audit, Bounces | Email, bounce count, transient and permanent counts, platform-rejected flag, status, created, last updated. | Bounce and suppression list fed by provider webhooks. |
| 62 | 29 Aug 09:55 | Admin, Email audit, History | Subject, remote ID, bounced, bounce error, sent time. | Outbound email log. |
| 63 | 29 Aug 09:55 | Admin, App or websites | 118 discovered apps and sites with type "Productive" and accumulated duration; checkboxes for bulk edits. | Classification catalog (productive, unproductive, neutral) with bulk edit and team overrides. |
| 64 | 29 Aug 09:55 | Admin, Timesheet breaks | Break types with status, created date and delete action. | Break type master. |
| 65 | 29 Aug 09:56 | Admin, Forms, Task | A "Visit type" form: published, 3 fields, data type Customer. | Task forms bound to an entity type. |
| 66 | 29 Aug 09:56 | Admin, Forms, Expense | Empty list; columns include workflow, form table and restriction. | Expense forms bound to workflows. |
| 67 | 29 Aug 09:56 | Admin, Forms, Check in (builder) | Drag-and-drop builder: palette of about 35 field types on the left, empty canvas, properties panel on the right. | Form builder (master prompt Appendix D). |
| 68 | 29 Aug 09:56 | Admin, Tags, Employee | Same builder used to define employee custom fields. | Custom fields per entity. |
| 69 | 29 Aug 09:57 | Admin, Tags, Customer | Builder for customer fields, with an extra Label field type. | Customer custom fields. |
| 70 | 29 Aug 09:57 | Admin, Tags, Contact | Builder for contact fields. | Contact custom fields. |
| 71 | 29 Aug 09:57 | Admin, Workflows (Version 2) | Workflow list: Default, type Expense, Published, created date, linked forms. | Versioned workflows linked to forms. |
| 72 | 29 Aug 09:58 | Admin, Workflow designer | Node canvas: Start (Pending) branching to Success (Approved) and Failed (Rejected); Add stage, Save, status, minimap, zoom controls. | Graph-based approval designer. |
| 73 | 29 Aug 09:58 | Admin, Notifications | Trigger, number of audience, status, creator, create time; status filter; Add notification. | Rule-based notifications. |
| 74 | 29 Aug 09:58 | Admin, Attendance policies | Empty list; Create attendance policy. | Policy list. |
| 75 | 29 Aug 09:58 | Admin, Create attendance policy | Policy name, start date, attached working shifts, description; rule picker (late punch-in, early punch-out, productivity, task completed); "Create and publish" or "Create"; warning that rules cannot be edited after publishing. | Immutable published policy versions. |
| 76 | 29 Aug 09:59 | Admin, Leave profiles | Three profiles with created dates. | Leave profile groups employees sharing leave rules, holidays and weekly offs. |
| 77 | 29 Aug 09:59 | Leave profile, Detail | Title, half-day leave toggle, delete. | Profile-level flags. |
| 78 | 29 Aug 09:59 | Leave profile, Employees | Assigned employees (empty); add. | Profile membership. |
| 79 | 29 Aug 09:59 | Admin, Leave types | Two types (unpaid, paid) with number of profiles and policies, created by, created on, last updated. | Leave types reused across profiles. |
| 80 | 29 Aug 09:59 | Leave type, Basic details | Name, colour label, paid or unpaid, mark as LOP deduction, code, leave profile, description, enabled; tabs for Entitlement, Restrictions, Audit history. | Leave type schema. |
| 81 | 29 Aug 09:59 | Leave type, Entitlement | Effective N months after joining, credit after policy period, flexible leave, accrual (monthly, quarterly, half-yearly, flat, equally distributed), total days (24), compensatory leave, "Add more policy" for additional tiers. | Accrual engine with experience tiers. |
| 82 | 29 Aug 10:00 | Leave type, Restrictions | Treatment of weekends and holidays inside a leave period; exceeding balance (don't allow, allow without limit, until year-end limit); past and future date windows. | Sandwich rules and balance rules. |
| 83 | 29 Aug 10:00 | Leave type, Restrictions (scrolled) | Allowed durations (full, half day), gender, reason mandatory, show type and summary to employees, max per application, max consecutive days, max applications per period, cannot be combined with other types, auto-approve. | Remaining restriction rules. |
| 84 | 29 Aug 10:00 | Leave type, Audit history | Action, field changes, actioned on, action by (empty). | Audit on leave types. |
| 85 | 29 Aug 10:00 | Admin, Holidays | Session filter; name, start date, end date, days, leave profiles, action (empty). | Holidays per profile per session. |
| 86 | 29 Aug 10:00 | Admin, Non working days | Name, week, day, leave profile, created (empty); Add non working day and Working day buttons. | Weekly-off patterns such as 2nd and 4th Saturdays. |
| 87 | 29 Aug 10:01 | Account settings, Account | Distance unit, timezone, DSR report field, min and max mobile length, default language, several toggles, home dashboard widget toggles (holiday, birthday, work anniversary), work-location identifier display. | Tenant general settings. |
| 88 | 29 Aug 10:01 | Account settings, Customer | Unique, visible and mandatory fields; appended customer field; default country code; toggles for tag without name, contact phone, remote field, search on remote ID, manage contacts, link remote ID, gallery option at check-in, field search; fields shown on mobile list. | Configurable customer schema and ERP remote ID support. |
| 89 | 29 Aug 10:01 | Account settings, Customer (scrolled) | Geo address update source (by employee, by check-in, by task, no geo); access settings. | Customer location provenance rules. |
| 90 | 29 Aug 10:01 | Account settings, Contact | Unique, mandatory and visible fields; mobile visibility (show all, my reportees, same team); disable contact creation; default country code India (+91). | Contact visibility scopes. |
| 91 | 29 Aug 10:01 | Account settings, Expense | Currency, PDF in landscape, PDF in order form details, payment tab on mobile, common PDF fields, common fields visible to managers, common expense form fields table. | Expense output and shared fields. |
| 92 | 29 Aug 10:01 | Account settings, Task (part 1) | About 40 toggles: complete on behalf of employee, punch-out restriction while tasks pending, task type sorting, repeat on start time, kanban stage colours, accuracy from check-in lat/long, overdue access for managers, customer task title pattern, month-based visibility, start restrictions by start and end time, restrict creation on approved leave, remove "skip OTP", hide priority, overdue evaluation. | Task behaviour flags. |
| 93 | 29 Aug 10:02 | Account settings, Task (feature switches) | Reminder, bulk upload, edit, delete, comment, workflow, calendar, dashboard, OTP, hide customer from employee, assign to group, distribution list, activity alert, images, JSON field, in-progress state, document ZIP download, Excel image, priority, customer contact, task download, task calendar, payment field; mobile list and detail fields. | Per-tenant task feature switches. |
| 94 | 29 Aug 10:02 | Account settings, Task (scrolled) | Common task form fields, task status colour overrides (pending, in progress, completed), custom colour fields, location-analytics field settings. | Status theming and analytics field mapping. |
| 95 | 29 Aug 10:02 | Account settings, Check in | Time restriction toggle. | Check-in time window rule. |
| 96 | 29 Aug 10:02 | Account settings, Mobile app | "Exclude recent screens" toggle. | Hide app content from the Android recents view. |
| 97 | 29 Aug 10:02 | Account settings, Cloud call | Calling provider selection, list options, employee restriction by employee, team, department, designation and work location. | Telephony integration with scoped rollout. |
| 98 | 29 Aug 10:03 | Account settings, Kanban | Choose which fields appear on task kanban cards. | Kanban card configuration. |
| 99 | 29 Aug 10:03 | Account settings, Date format | Format for daily productivity/task reports and for attendance/distance reports, with a reference panel of patterns. | Per-report-family date formats. |
| 100 | 29 Aug 10:04 | Account settings, Date format (scrolled) | Reference panel continued: dot, text-based and ISO formats. | Same as above. |
| 101 | 29 Aug 10:04 | Account settings, Attendance (part 1) | Override start and end day, restrict regularization, approval required by default, disable editing punch times, approval message optional, no-manager restriction, override regularization time, show late mark in monthly view, override non-working days. | Attendance behaviour flags. |
| 102 | 29 Aug 10:04 | Account settings, Attendance (part 2) | Work anniversary in calendar, restrict punch-in on approved leave, re-run attendance policy, month start day, total present in monthly view, override attendance colour code table (symbol, code, title, colour). | Recalculation tool and configurable register symbols. |
| 103 | 29 Aug 10:04 | Account settings, Leave | Session range, carry-forward applicable days, apply for old session, show leave type in Excel download, further toggles. | Leave-year configuration. |
| 104 | 29 Aug 10:04 | Account settings, Employee profile | Mandatory fields, optional fields employees may self-update, mobile profile information, restrict profile edits on mobile. | Self-service profile rules. |
| 105 | 29 Aug 10:05 | Account settings, Employee profile (repeat) | Same page as 104. | No new information. |
| 106 | 29 Aug 10:05 | Account settings, Log in | Sign-in method toggles including Microsoft and Google accounts. | Per-tenant authentication methods. |
| 107 | 29 Aug 10:08 | Account settings, Geo | Check-in geo match, task-complete geo match, geo-fence request restriction. | Geo validation thresholds. |
| 108 | 29 Aug 10:08 | Account settings, Customer notification | Toggles for punch in, punch out, leave applied, leave actioned, expense applied, approved and rejected, check-in and check-out forms, task started and completed. | Outbound notification events. |
| 109 | 29 Aug 10:09 | Account settings, Desktop app | "Consider productive time" toggle with an explanation of how productivity is computed. | Configurable productivity formula. |
| 110 | 29 Aug 10:09 | Account settings, Audit history | Empty audit table. | Settings change audit. |
| 111 | 29 Aug 10:09 | Admin, Geo fences | Title, type, address, created, action (empty); Add geo fence. | Circle and polygon fences. |
| 112 | 29 Aug 10:09 | Admin, Billings, Licenses | "Sales + call log" (Basic, Tracking, Attendance, Leave, Expense, Task, Call log) with 6 of 6 seats consumed; "Desktop" (Basic, Attendance, Leave, Activity) with 10 of 10 consumed. | Seat-based module bundles (master prompt 5.23). |
| 113 | 29 Aug 10:10 | Admin, Billings, Deleted employees | Deleted employees with restore action, identity, status (never punched in, or out N months ago), type, manager, team. | Seat release and restore. |
| 114 | 29 Aug 10:10 | Admin, Billings, Subscription | Activation date and next renewal date. | Subscription summary for tenants. |
| 115 | 29 Aug 10:10 | Admin, Tools | Tool type selector and submit button. | Admin utilities (bulk operations, recalculations). |
| 116 | 29 Aug 10:10 | Switch modules dialog | Searchable dialog with two modes: Employee (own tasks, leave and so on) and Manager (team tracking and activities). | Employee and Manager mode switcher. |
| 117 | 29 Aug 10:11 | Profile menu | Name, email, language selector, settings, logout. | Profile menu with locale switch. |
