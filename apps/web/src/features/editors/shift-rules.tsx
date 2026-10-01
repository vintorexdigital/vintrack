'use client';
import { options, SpecForm, type SpecItem } from '@/shared/crud/spec-form';
import type { EditorProps } from '@/shared/crud/resource';

const platforms = options(['mobile', 'desktop', 'web']);
const tri = options(['off', 'optional', 'mandatory']);

const SPEC: SpecItem[] = [
  { group: 'Platforms', hint: 'Where employees on this shift may punch, sign in and take breaks.' },
  { path: 'platforms.punchSources', label: 'Allowed punch sources', kind: 'multi', options: platforms },
  { path: 'platforms.loginPlatforms', label: 'Allowed sign-in platforms', kind: 'multi', options: platforms },
  { path: 'platforms.breakPlatforms', label: 'Platforms that can mark breaks', kind: 'multi', options: platforms },
  { group: 'Automatic punch-out' },
  { path: 'autoPunchOut.enabled', label: 'Punch out automatically', kind: 'bool', help: 'Closes sessions that were left open.' },
  { path: 'autoPunchOut.mode', label: 'Based on', kind: 'select', options: [{ value: 'hours', label: 'Hours after punch-in' }, { value: 'clock', label: 'A fixed clock time' }], when: (v) => !!(v.autoPunchOut as { enabled?: boolean })?.enabled },
  { path: 'autoPunchOut.hours', label: 'Hours after punch-in', kind: 'num', min: 1, max: 24, when: (v) => (v.autoPunchOut as { enabled?: boolean; mode?: string })?.enabled === true && (v.autoPunchOut as { mode?: string }).mode === 'hours' },
  { path: 'autoPunchOut.clockTime', label: 'Clock time', kind: 'time', when: (v) => (v.autoPunchOut as { enabled?: boolean; mode?: string })?.enabled === true && (v.autoPunchOut as { mode?: string }).mode === 'clock' },
  { path: 'autoPunchOut.blockAfter', label: 'Block further punches until the next attendance day', kind: 'bool', when: (v) => !!(v.autoPunchOut as { enabled?: boolean })?.enabled },
  { group: 'Regularization' },
  { path: 'regularization.enabled', label: 'Allow regularization requests', kind: 'bool' },
  { path: 'regularization.daysBack', label: 'How many days back', kind: 'num', min: 0, max: 90, when: (v) => !!(v.regularization as { enabled?: boolean })?.enabled },
  { path: 'regularization.approvalRequired', label: 'Require approval', kind: 'bool', when: (v) => !!(v.regularization as { enabled?: boolean })?.enabled },
  { group: 'Punch restrictions' },
  { path: 'punch.blockEarlyMinutes', label: 'Block punch-in earlier than (minutes before start)', kind: 'nullable-num', min: 0, max: 720, help: 'Leave empty for no limit.' },
  { path: 'punch.blockAfterMaxPunchIn', label: 'Block punch-in after the latest allowed time', kind: 'bool' },
  { path: 'punch.commentOnIn', label: 'Require a comment on punch-in', kind: 'bool' },
  { path: 'punch.commentOnOut', label: 'Require a comment on punch-out', kind: 'bool' },
  { path: 'punch.ipAllowlist', label: 'Allowed IP ranges for web and desktop punches', kind: 'lines', help: 'Comma-separated IPs or CIDR ranges. Leave empty to allow any network.' },
  { path: 'punch.blockAtHome.enabled', label: 'Block punches at the employee\'s home location', kind: 'bool' },
  { path: 'punch.blockAtHome.radiusMeters', label: 'Home radius (metres)', kind: 'num', min: 10, max: 5000, when: (v) => !!(getEnabled(v, 'punch.blockAtHome.enabled')) },
  { path: 'punch.selfie', label: 'Selfie on mobile', kind: 'select', options: tri },
  { path: 'punch.location', label: 'Location', kind: 'select', options: tri },
  { path: 'punch.watermarkDateTime', label: 'Watermark date and time on selfies', kind: 'bool' },
  { path: 'punch.watermarkAddress', label: 'Watermark address on selfies', kind: 'bool' },
  { path: 'punch.allowAppWithoutProof', label: 'Allow app punches without location and selfie', kind: 'bool', help: 'An explicit override for staff in areas without coverage.' },
  { path: 'punch.fencesIn', label: 'Geo-fences allowed for punch-in', kind: 'refs', entity: 'geo-fences', help: 'Leave empty for no fence check.' },
  { path: 'punch.fencesOut', label: 'Geo-fences allowed for punch-out', kind: 'refs', entity: 'geo-fences' },
  { group: 'Timesheets' },
  { path: 'timesheet.hidePastBreaks', label: 'Hide past breaks', kind: 'bool' },
  { path: 'timesheet.hidePastActivities', label: 'Hide past activities', kind: 'bool' },
  { path: 'timesheet.blockPunchInUntilSubmitted', label: 'Block punch-in until the previous timesheet is submitted', kind: 'bool' },
  { group: 'Mobile app' },
  { path: 'mobile.deviceBinding', label: 'Bind each employee to one device', kind: 'bool', help: 'The first phone that punches is registered; others are refused until reset.' },
  { path: 'mobile.biometric', label: 'Biometric unlock', kind: 'select', options: options(['off', 'enabled', 'forced']) },
  { path: 'mobile.requirePunchInBeforeUse', label: 'Require punch-in before using the app', kind: 'bool' },
  { path: 'mobile.requireCheckoutBeforePunchOut', label: 'Require check-out before punch-out', kind: 'bool' },
  { path: 'mobile.requirePunchOutBeforeLogout', label: 'Require punch-out before sign-out', kind: 'bool' },
  { group: 'Desktop computers' },
  { path: 'computer.autoPunchIn', label: 'Punch in automatically when the computer is first used in the shift window', kind: 'bool' },
  { path: 'computer.autoPunchOutOnShutdown', label: 'Punch out automatically on shutdown or a long lock', kind: 'bool' },
  { path: 'computer.lockMinutes', label: 'Long lock after (minutes)', kind: 'num', min: 5, max: 480, when: (v) => !!getEnabled(v, 'computer.autoPunchOutOnShutdown') },
];

function getEnabled(v: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], v);
}

export function ShiftRulesEditor({ value, onChange, disabled }: EditorProps) {
  return <SpecForm spec={SPEC} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} disabled={disabled} />;
}
