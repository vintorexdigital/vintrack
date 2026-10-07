import { z } from 'zod';

export type SettingType = 'boolean' | 'number' | 'text' | 'select' | 'multiselect';
export type SettingScopeType = 'tenant' | 'shift' | 'team' | 'employee';

export interface SettingDef {
  key: string;
  section: string;
  /** Sub-heading inside a section; settings are grouped by intent, not as one long toggle wall. */
  group: string;
  label: string;
  description: string;
  type: SettingType;
  default: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  scopes: SettingScopeType[];
  /** Licensed module that must be on for the setting to show. */
  module?: string;
}

const T: SettingScopeType[] = ['tenant'];
const opt = (xs: string[]) => xs.map((value) => ({ value, label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));

function def(section: string, module: string | undefined) {
  const base = { section, ...(module ? { module } : {}) };
  return {
    bool: (group: string, key: string, label: string, description: string, dflt = false, scopes = T): SettingDef =>
      ({ ...base, group, key, label, description, type: 'boolean', default: dflt, scopes }),
    num: (group: string, key: string, label: string, description: string, dflt: number, o: { min?: number; max?: number } = {}, scopes = T): SettingDef =>
      ({ ...base, group, key, label, description, type: 'number', default: dflt, scopes, ...o }),
    text: (group: string, key: string, label: string, description: string, dflt = '', scopes = T): SettingDef =>
      ({ ...base, group, key, label, description, type: 'text', default: dflt, scopes }),
    sel: (group: string, key: string, label: string, description: string, options: string[], dflt: string, scopes = T): SettingDef =>
      ({ ...base, group, key, label, description, type: 'select', default: dflt, options: opt(options), scopes }),
    multi: (group: string, key: string, label: string, description: string, options: string[], dflt: string[], scopes = T): SettingDef =>
      ({ ...base, group, key, label, description, type: 'multiselect', default: dflt, options: opt(options), scopes }),
  };
}

const account = def('Account', undefined);
const attendance = def('Attendance', 'attendance');
const leave = def('Leave', 'leave');
const customer = def('Customers', 'customers');
const contact = def('Contacts', 'customers');
const expense = def('Expenses', 'expenses');
const task = def('Tasks', 'tasks');
const geo = def('Geo', 'tracking');
const desktop = def('Desktop', 'desktop_activity');
const security = def('Sign-in and security', undefined);
const profile = def('Employee profile', undefined);
const notify = def('Customer notifications', 'customers');
const calls = def('Calls', 'call_log');
const approvals = def('Approvals', undefined);
const dates = def('Date formats', undefined);

/** Every tenant setting, grouped by intent. The generic settings page renders from this list. */
export const SETTINGS: SettingDef[] = [
  // Account
  account.sel('Regional', 'account.distance_unit', 'Distance unit', 'Used in travel reports and the map.', ['km', 'mi'], 'km'),
  account.text('Regional', 'account.default_language', 'Default language', 'Language new employees see first.', 'en'),
  account.num('Regional', 'account.mobile_min_length', 'Shortest mobile number', 'Digits, excluding the country code.', 10, { min: 4, max: 15 }),
  account.num('Regional', 'account.mobile_max_length', 'Longest mobile number', 'Digits, excluding the country code.', 10, { min: 4, max: 15 }),
  account.bool('Display', 'account.show_work_location_id', 'Show work location identifier', 'Adds the location code next to its name.'),
  account.bool('Home dashboard', 'account.hide_holiday_widget', 'Hide the holiday widget', 'Removes it from every Home dashboard.'),
  account.bool('Home dashboard', 'account.hide_birthday_widget', 'Hide the birthday widget', 'Removes it from every Home dashboard.'),
  account.bool('Home dashboard', 'account.hide_anniversary_widget', 'Hide the work anniversary widget', 'Removes it from every Home dashboard.'),
  account.text('Reports', 'account.dsr_report_field', 'Daily activity report field', 'The task field shown as the activity description.'),

  // Sign-in and security
  security.bool('Methods', 'auth.method.password', 'Allow password sign-in', 'Turn off to require a one-time code or SSO.', true),
  security.bool('Methods', 'auth.method.mobile_otp', 'Allow mobile OTP', 'Sign in with a code sent by SMS.', true),
  security.bool('Methods', 'auth.method.email_otp', 'Allow email OTP', 'Sign in with a code sent by email.', true),
  security.bool('Methods', 'auth.method.google', 'Allow Google sign-in', 'Needs a Google account that matches the employee email.', true),
  security.bool('Methods', 'auth.method.microsoft', 'Allow Microsoft sign-in', 'Needs a Microsoft work account.', true),
  security.num('Sessions', 'auth.session_days', 'Stay signed in for (days)', 'Refresh tokens on the web last this long.', 30, { min: 1, max: 90 }),
  security.bool('Admins', 'auth.require_admin_2fa', 'Require two-step verification for admins', 'Admins confirm sign-in with an authenticator app.', true),
  security.num('Passwords', 'auth.password_min_length', 'Minimum password length', 'Applies to new passwords.', 10, { min: 8, max: 64 }),
  security.text('Network', 'auth.ip_allowlist', 'Allowed IP ranges', 'Comma-separated CIDR ranges for web sign-in. Leave empty to allow any network.'),

  // Employee profile
  profile.multi('Required fields', 'profile.mandatory_fields', 'Mandatory fields', 'Employees cannot be saved without these.', ['workEmail', 'mobile', 'dateOfBirth', 'gender', 'departmentId', 'designationId', 'workLocationId'], ['mobile']),
  profile.multi('Self-service', 'profile.self_editable_fields', 'Fields employees may edit themselves', 'Applies on web and mobile.', ['displayName', 'personalEmail', 'mobile', 'dateOfBirth', 'gender'], ['personalEmail']),
  profile.bool('Self-service', 'profile.block_mobile_edit', 'Block profile edits on mobile', 'Employees can edit their profile on the web only.'),

  // Attendance
  attendance.num('Cycle', 'attendance.month_start_day', 'Attendance month starts on day', 'For example 26 gives a 26th to 25th cycle.', 1, { min: 1, max: 28 }),
  attendance.bool('Approvals', 'attendance.approval_required_default', 'Require approval for regularization by default', 'New regularization requests wait for a manager.', true),
  attendance.bool('Approvals', 'attendance.approval_message_optional', 'Make the approval comment optional', 'Managers can approve or reject without writing a comment.'),
  attendance.bool('Approvals', 'attendance.require_manager', 'Block regularization when an employee has no manager', 'Employees without a reporting manager cannot request regularization.'),
  attendance.bool('Editing', 'attendance.disable_edit_punch_times', 'Stop employees editing punch times', 'Only managers can change a recorded punch.'),
  attendance.bool('Editing', 'attendance.restrict_regularization', 'Restrict regularization to the shift window', 'Requests must fall within the shift\'s allowed days.'),
  attendance.num('Editing', 'attendance.regularization_days', 'Regularization window (days)', 'How many days back an employee may ask.', 7, { min: 0, max: 90 }),
  attendance.bool('Register', 'attendance.show_late_marks', 'Show late marks in the monthly register', 'Adds the late-mark indicator to each cell.', true),
  attendance.bool('Register', 'attendance.show_total_present', 'Show a total present column', 'Adds a summary column at the end of each row.', true),
  attendance.bool('Register', 'attendance.override_non_working', 'Let managers override non-working days', 'A manager can mark a non-working day as worked.'),
  attendance.bool('Calendars', 'attendance.show_anniversaries', 'Show work anniversaries in calendars', 'Adds anniversaries beside holidays.'),
  attendance.bool('Leave', 'attendance.block_punch_on_leave', 'Block punch-in on approved leave', 'Employees on approved leave cannot punch in.'),

  // Leave
  leave.text('Session', 'leave.session_start', 'Leave session starts on', 'Month and day, for example 01-01 for January 1.', '01-01'),
  leave.text('Session', 'leave.carry_forward_date', 'Carry-forward processed on', 'Month and day when balances roll over.', '01-01'),
  leave.bool('Applying', 'leave.apply_previous_session', 'Allow applying against the previous session', 'Useful during the first weeks after rollover.'),
  leave.bool('Exports', 'leave.type_in_export', 'Show the leave type in Excel exports', 'Adds a column to leave exports.', true),

  // Customers
  customer.multi('Fields', 'customer.unique_fields', 'Unique fields', 'No two customers can share these values.', ['name', 'mobile', 'email', 'remoteId'], []),
  customer.multi('Fields', 'customer.mandatory_fields', 'Mandatory fields', 'Required when creating a customer.', ['name', 'mobile', 'email', 'address', 'category'], ['name']),
  customer.multi('Fields', 'customer.visible_fields', 'Visible fields', 'Shown on customer pages.', ['mobile', 'email', 'address', 'category', 'owner', 'remoteId'], ['mobile', 'address', 'category']),
  customer.text('Fields', 'customer.default_country_code', 'Default country code', 'Added to numbers entered without one.', '+91'),
  customer.bool('Fields', 'customer.allow_no_name', 'Allow customers without a name', 'Tag a location before the name is known.'),
  customer.bool('Fields', 'customer.contact_phone_required', 'Require a contact phone', 'Each customer needs at least one phone number on a contact.'),
  customer.bool('Remote ID', 'customer.show_remote_id', 'Show the remote ID', 'The ID from your ERP or accounting system.'),
  customer.bool('Remote ID', 'customer.search_remote_id', 'Search by remote ID', 'Includes it in customer search.'),
  customer.bool('Remote ID', 'customer.link_remote_id', 'Link the remote ID to a record', 'Adds a link to the external record.'),
  customer.bool('Contacts', 'customer.manage_contacts', 'Manage contacts from the customer page', 'Adds and edits contacts inline.', true),
  customer.bool('Check-in', 'customer.gallery_at_checkin', 'Allow gallery photos at check-in', 'Off means camera only.'),
  customer.sel('Location', 'customer.geo_source', 'Where a customer location comes from', 'Which action updates a customer\'s address on the map.', ['employee', 'check_in', 'task', 'none'], 'check_in'),
  customer.sel('Access', 'customer.access', 'Who can see customers', 'Narrower scopes help large teams.', ['all', 'owned_and_team'], 'all'),

  // Contacts
  contact.multi('Fields', 'contact.unique_fields', 'Unique fields', 'No two contacts can share these values.', ['mobile', 'email'], []),
  contact.multi('Fields', 'contact.mandatory_fields', 'Mandatory fields', 'Required when creating a contact.', ['name', 'mobile', 'email', 'designation'], ['name']),
  contact.sel('Visibility', 'contact.mobile_visibility', 'Who can see contact mobile numbers', 'Applies on mobile.', ['all', 'my_reportees', 'same_team'], 'all'),
  contact.bool('Visibility', 'contact.disable_mobile_create', 'Stop employees creating contacts on mobile', 'Contacts are managed on the web only.'),
  contact.text('Fields', 'contact.default_country_code', 'Default country code', 'Added to numbers entered without one.', '+91'),

  // Expenses
  expense.text('Claims', 'expense.currency', 'Default currency', 'Claim amounts use this unless the type says otherwise.', 'INR'),
  expense.sel('Claim PDF', 'expense.pdf_orientation', 'Claim PDF orientation', 'Page layout for downloaded claims.', ['portrait', 'landscape'], 'portrait'),
  expense.bool('Claim PDF', 'expense.pdf_order_details', 'Include order form details in the PDF', 'Adds the linked task form to the claim PDF.'),
  expense.bool('Mobile', 'expense.payment_tab', 'Show a payment tab on mobile', 'Employees see reimbursement status.'),
  expense.bool('Managers', 'expense.common_fields_for_managers', 'Show common fields to managers', 'Adds shared fields to the approval view.', true),

  // Tasks: execution
  task.bool('Execution', 'task.complete_on_behalf', 'Managers can complete tasks for employees', 'Useful when an employee forgets to close a visit.'),
  task.bool('Execution', 'task.complete_in_progress_on_behalf', 'Managers can complete in-progress tasks for employees', 'Needs the setting above.'),
  task.bool('Execution', 'task.repeat_on_start_time', 'Repeat tasks from their start time', 'Instead of the original schedule.'),
  task.sel('Execution', 'task.accuracy_source', 'Measure accuracy from', 'Which position a completed task is compared with.', ['check_in', 'task_position'], 'task_position'),
  task.bool('Execution', 'task.otp_completion', 'Require customer OTP to complete', 'A code is sent to the customer contact.'),
  task.bool('Execution', 'task.remove_skip_otp', 'Remove the "skip OTP" option', 'Employees cannot bypass the OTP step.'),
  task.bool('Execution', 'task.payment_field', 'Show a payment field', 'Collect payments on completion.'),
  task.sel('Execution', 'task.overdue_rule', 'A task is overdue when', 'How overdue is evaluated.', ['end_time_passed', 'end_date_passed'], 'end_time_passed'),
  // Tasks: restrictions
  task.bool('Restrictions', 'task.block_punchout_pending', 'Block punch-out while tasks are pending', 'Employees close their visits first.'),
  task.bool('Restrictions', 'task.block_start_outside_window', 'Block starting a task outside its time window', 'Before the start time or after the end time.'),
  task.bool('Restrictions', 'task.block_create_on_leave', 'Block creating tasks on approved leave', 'For the assignee.'),
  task.bool('Restrictions', 'task.location_restriction', 'Restrict task location', 'Employees cannot change the task location.'),
  task.bool('Restrictions', 'task.edit_request_after_complete', 'Employees request edits to completed tasks', 'A manager approves the change.'),
  // Tasks: visibility
  task.bool('Visibility', 'task.month_visibility', 'Show only the current month by end date', 'Hides older tasks from lists.'),
  task.bool('Visibility', 'task.manager_overdue_access', 'Managers can see overdue tasks on mobile', 'For their team.', true),
  task.bool('Visibility', 'task.location_visibility', 'Limit tasks by work location', 'Employees see tasks for their location.'),
  task.bool('Visibility', 'task.hide_customer_from_employee', 'Hide customers from employees', 'Employees see the task but not the customer record.'),
  task.bool('Visibility', 'task.functional_manager_edit', 'Functional managers can edit tasks', 'Beyond viewing.'),
  task.bool('Visibility', 'task.today_pending_tab', 'Show a "Today pending" tab on mobile', 'A quick view of what is due.', true),
  // Tasks: features
  task.bool('Features', 'task.feature.reminders', 'Reminders', 'Remind assignees before a task starts.', true),
  task.bool('Features', 'task.feature.bulk_upload', 'Bulk upload', 'Create tasks from a spreadsheet.', true),
  task.bool('Features', 'task.feature.edit', 'Editing', 'Allow tasks to be edited after creation.', true),
  task.bool('Features', 'task.feature.delete', 'Deleting', 'Allow tasks to be deleted.', true),
  task.bool('Features', 'task.feature.comments', 'Comments', 'Add a comment thread to each task.', true),
  task.bool('Features', 'task.feature.workflow', 'Workflows', 'Route task completion through an approval.'),
  task.bool('Features', 'task.feature.calendar', 'Calendar view', 'Show tasks on a calendar.', true),
  task.bool('Features', 'task.feature.assign_group', 'Assign to a group', 'Assign one task to a team.'),
  task.bool('Features', 'task.feature.distribution_lists', 'Distribution lists', 'Assign tasks to saved lists of employees.'),
  task.bool('Features', 'task.feature.activity_alerts', 'Activity alerts', 'Notify managers on task activity.'),
  task.bool('Features', 'task.feature.images', 'Images', 'Attach photos to tasks.', true),
  task.bool('Features', 'task.feature.in_progress', 'In-progress status', 'Add a status between pending and completed.', true),
  task.bool('Features', 'task.feature.zip_download', 'Document ZIP download', 'Download all documents of a task at once.'),
  task.bool('Features', 'task.feature.excel_images', 'Images in Excel', 'Embed photos in task exports.'),
  task.bool('Features', 'task.feature.priority', 'Priority', 'Add a priority to each task.', true),
  task.bool('Features', 'task.feature.customer_contact', 'Customer contact', 'Pick a customer contact on each task.', true),
  task.bool('Features', 'task.feature.download', 'Task download', 'Download a task as PDF.', true),
  task.bool('Features', 'task.feature.employee_stage_audit', 'Employee stage audit', 'Record who moved a task between stages.'),
  // Tasks: display
  task.text('Display', 'task.title_pattern', 'Task title pattern', 'Variables: {type}, {customer}, {date}.', '{type} for {customer}'),
  task.text('Display', 'task.download_name_pattern', 'Download file name pattern', 'Variables: {code}, {customer}, {date}.', '{code}'),
  task.bool('Display', 'task.sort_by_type', 'Sort task types alphabetically', 'Otherwise in the order they were created.'),
  task.bool('Display', 'task.board_stage_colors', 'Use stage colors on the board', 'Colors each column.', true),
  task.multi('Display', 'task.board_card_fields', 'Board card fields', 'Fields shown on each card.', ['customer', 'assignee', 'priority', 'dueDate', 'type'], ['customer', 'assignee', 'dueDate']),

  // Check-in
  task.bool('Check-in', 'checkin.time_restriction', 'Restrict check-in to the shift window', 'Employees can only check in during working hours.'),

  // Mobile
  def('Mobile app', undefined).bool('Privacy', 'mobile.exclude_recents', 'Hide app content from recent screens', 'Stops the system showing a preview of the app.', true),

  // Calls
  calls.sel('Cloud calling', 'calls.provider', 'Cloud calling', 'Lets employees call customers from Trackrex: we ring their phone, then connect the customer.', ['none', 'trackrex'], 'none'),
  calls.bool('Cloud calling', 'calls.record_calls', 'Record calls', 'Recordings are kept for the period below and every listen is logged. Tell customers: you are responsible for any consent your law requires.', false),
  calls.bool('Cloud calling', 'calls.announce_recording', 'Announce recording to the customer', 'Plays a short notice at the start of a recorded call.', true),
  calls.num('Cloud calling', 'calls.recording_retention_days', 'Keep recordings for (days)', 'Older recordings are deleted automatically.', 90, { min: 7, max: 730 }),

  // Approvals
  approvals.num('Levels', 'approvals.leave_levels', 'Leave approval levels', 'How many people up the reporting line must approve a leave request. 1 means the direct manager only.', 1, { min: 1, max: 3 }),
  approvals.num('Levels', 'approvals.regularization_levels', 'Regularization approval levels', 'How many people up the reporting line must approve a regularization.', 1, { min: 1, max: 3 }),
  approvals.num('Levels', 'approvals.expense_levels', 'Expense approval levels', 'How many people up the reporting line must approve an expense claim.', 1, { min: 1, max: 3 }),
  approvals.num('Levels', 'approvals.expense_extra_level_from', 'Extra approval level for claims of at least', 'Claims at or above this amount need one more level than above. 0 turns this off.', 0, { min: 0, max: 100_000_000 }),

  // Date formats
  dates.sel('Reports', 'dates.productivity_report', 'Productivity and task reports', 'How dates appear in these reports.', ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'], 'DD/MM/YYYY'),
  dates.sel('Reports', 'dates.attendance_report', 'Attendance and distance reports', 'How dates appear in these reports.', ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'], 'DD/MM/YYYY'),

  // Geo
  geo.num('Check-in', 'geo.checkin_distance', 'Check-in match distance (metres)', 'How near the customer an employee must be.', 200, { min: 10, max: 10000 }),
  geo.sel('Check-in', 'geo.checkin_mode', 'When the check-in is too far', 'Warn lets the employee continue; block stops them.', ['warn', 'block', 'off'], 'warn'),
  geo.sel('Tasks', 'geo.task_complete_mode', 'When a task is completed too far away', 'Compared with the task location.', ['warn', 'block', 'off'], 'warn'),
  geo.bool('Tracking', 'geo.tracking_enabled', 'Track location during working time', 'Employees are tracked only between punch in and punch out, and always see when tracking is on.', true),
  geo.num('Tracking', 'geo.ping_interval_seconds', 'Location update interval (seconds)', 'How often the mobile app reports its position while punched in.', 120, { min: 30, max: 900 }),
  geo.num('Tracking', 'geo.trail_retention_days', 'Keep location history for (days)', 'Older location points are deleted automatically.', 90, { min: 7, max: 730 }),
  geo.bool('Fences', 'geo.employee_fence_requests', 'Let employees request geo-fences', 'A manager approves each request.'),

  // Customer notifications
  notify.bool('Attendance', 'notify.customer.punch_in', 'Punch in', 'Message customers when an employee punches in.'),
  notify.bool('Attendance', 'notify.customer.punch_out', 'Punch out', 'Message customers when an employee punches out.'),
  notify.bool('Leave', 'notify.customer.leave_applied', 'Leave applied', 'Message customers when leave is applied.'),
  notify.bool('Leave', 'notify.customer.leave_actioned', 'Leave approved or rejected', 'Message customers when leave is actioned.'),
  notify.bool('Expenses', 'notify.customer.expense_applied', 'Expense submitted', 'Message customers when an expense is submitted.'),
  notify.bool('Expenses', 'notify.customer.expense_actioned', 'Expense approved or rejected', 'Message customers when an expense is actioned.'),
  notify.bool('Visits', 'notify.customer.checkin_form', 'Check-in form submitted', 'Message customers on check-in.'),
  notify.bool('Visits', 'notify.customer.checkout_form', 'Check-out form submitted', 'Message customers on check-out.'),
  notify.bool('Tasks', 'notify.customer.task_started', 'Task started', 'Message customers when a task starts.'),
  notify.bool('Tasks', 'notify.customer.task_completed', 'Task completed', 'Message customers when a task is completed.'),

  // Desktop
  desktop.bool('Productivity', 'desktop.consider_recorded_time', 'Measure productivity against recorded time', 'Otherwise it is measured against working time.'),
  desktop.sel('Privacy', 'desktop.window_titles', 'Window titles', 'What the agent keeps from window titles.', ['drop', 'hash', 'keep'], 'drop'),
  desktop.bool('Privacy', 'desktop.full_urls', 'Track full website URLs', 'Otherwise only the domain is recorded. Employees are told.'),
  desktop.bool('Screenshots', 'desktop.screenshots_enabled', 'Capture screenshots', 'Off by default. Employees see a notice before it starts.'),
  desktop.num('Screenshots', 'desktop.screenshot_interval_minutes', 'Screenshot interval (minutes)', 'The moment inside the interval is random.', 10, { min: 5, max: 30 }),
  desktop.sel('Screenshots', 'desktop.screenshot_blur', 'Screenshot blur', 'Applied on the device before upload.', ['none', 'low', 'high'], 'low'),
  desktop.num('Screenshots', 'desktop.screenshot_retention_days', 'Keep screenshots for (days)', 'Older screenshots are deleted.', 30, { min: 1, max: 180 }),
];

export const SETTING_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
export const SETTING_SECTIONS = [...new Set(SETTINGS.map((s) => s.section))];

/** Validate a value against a setting definition. */
export function settingValueSchema(d: SettingDef): z.ZodType {
  switch (d.type) {
    case 'boolean': return z.boolean();
    case 'number': return z.number().min(d.min ?? -Infinity).max(d.max ?? Infinity);
    case 'text': return z.string().max(500);
    case 'select': return z.enum((d.options ?? []).map((o) => o.value) as [string, ...string[]]);
    case 'multiselect': return z.array(z.enum((d.options ?? []).map((o) => o.value) as [string, ...string[]]));
  }
}
