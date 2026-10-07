# 0019 Payroll, payslips and onboarding checklists

Status: accepted

## Payroll
- **One source for payable days.** A pay cycle is drafted from the same query that produces the payroll export of the monthly register (present, paid leave, weekly offs and holidays, less policy deductions). Payroll and attendance cannot disagree.
- **Salary structures** (`salary-structures`): basic, house rent, special and other allowances, provident fund and state insurance switches, a fixed professional tax and a fixed "other deductions" amount. Many per person over time; the one in force on the last day of the cycle applies.
- **Pay** is the structure prorated by payable days. Provident fund is 12% of basic earned, capped at the 15,000 wage ceiling. State insurance is 0.75% employee / 3.25% employer while gross is at or under 21,000. Overtime hours (not yet fed from attendance) would pay at twice the hourly rate of basic. Amounts are rounded to paise; deductions never take pay below zero and say so.
- **Run lifecycle:** `draft` (rebuilt on demand) → `finalized` (locks every attendance day in the cycle; payslips become visible to their owners) → `paid` (everyone is told their payslip is ready). A finalized run can be reopened (unlocking attendance); a paid one cannot.
- **Who sees what:** payroll staff (`payroll.run.*`) see runs and every payslip; an employee sees only their own, and only once finalized; managers see nothing. Support sessions cannot. Payslips print from a plain page ("Save as PDF" is the browser's).

### Honest limits
Tax deducted at source is not calculated (use "other deductions"), there are no filings (provident fund return, state insurance return, Form 16, professional-tax challans), no arrears or back-pay, no reimbursements or bonuses, no fiscal-year structure changes mid-cycle (a change takes effect from the cycle that contains it), and overtime is not wired in. The figures follow the usual Indian rules in simplified form and must not replace a payroll provider or an accountant's review.

## Onboarding and exit checklists
A template (`onboarding-templates`) lists steps, each for the employee, their manager, or a function (HR, IT, admin) with a due offset in days. Starting a checklist copies the steps onto a case for one person; a step for the employee or manager is assigned to them and they can tick it off; function steps are ticked by anyone with `onboarding.case.update`. The case completes when the last step is done. A workflow step can start a checklist automatically (for example when an employee is added), which is how the "joiner" and "leaver" paths are wired.

Not built: reminders for overdue steps, document upload per step, e-signature, conditional steps.
