import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { attendanceDateFor, type ShiftTiming } from '@trackrex/rules';
import { shiftRulesSchema, type ShiftRules } from '@trackrex/schemas';
import { Db } from '../../core/database/db.service.js';

export interface ShiftInfo {
  id: string;
  name: string;
  timing: ShiftTiming;
  rules: ShiftRules;
}

interface ShiftRow {
  id: string;
  name: string;
  timezone: string;
  start_time: string;
  max_punch_in_time: string | null;
  working_minutes: number;
  break_allowance_minutes: number | null;
  rules: unknown;
}

export function toShiftInfo(r: ShiftRow): ShiftInfo {
  return {
    id: r.id,
    name: r.name,
    timing: {
      timezone: r.timezone,
      startTime: r.start_time.slice(0, 5),
      ...(r.max_punch_in_time ? { maxPunchInTime: r.max_punch_in_time.slice(0, 5) } : {}),
      workingMinutes: r.working_minutes,
      ...(r.break_allowance_minutes != null ? { breakAllowanceMinutes: r.break_allowance_minutes } : {}),
    },
    rules: shiftRulesSchema.parse(r.rules ?? {}),
  };
}

const COLS = sql`s.id, s.name, s.timezone, s.start_time, s.max_punch_in_time, s.working_minutes, s.break_allowance_minutes, s.rules`;

/** Finds the shift an employee works on a date (effective-dated assignments, then the profile's current shift). */
@Injectable()
export class ShiftResolver {
  constructor(private readonly db: Db) {}

  async forDate(employeeId: string, date: string): Promise<ShiftInfo | null> {
    const assigned = await this.db.q.execute(sql`
      select ${COLS} from shift_assignments a join shifts s on s.id = a.shift_id and s.tenant_id = a.tenant_id
      where a.employee_id = ${employeeId}::uuid and a.effective_from <= ${date}::date and (a.effective_to is null or a.effective_to >= ${date}::date) and s.deleted_at is null
      limit 1`);
    if (assigned.rows[0]) return toShiftInfo(assigned.rows[0] as unknown as ShiftRow);
    const current = await this.db.q.execute(sql`
      select ${COLS} from employees e join shifts s on s.id = e.shift_id and s.tenant_id = e.tenant_id
      where e.id = ${employeeId}::uuid and s.deleted_at is null`);
    return current.rows[0] ? toShiftInfo(current.rows[0] as unknown as ShiftRow) : null;
  }

  /** The shift and attendance date a punch at `instantMs` belongs to. */
  async forInstant(employeeId: string, instantMs: number): Promise<{ shift: ShiftInfo; date: string } | null> {
    const guess = new Date(instantMs).toISOString().slice(0, 10);
    // The attendance date can differ from the UTC date by a day either way.
    for (const probe of [guess, addDay(guess, -1), addDay(guess, 1)]) {
      const shift = await this.forDate(employeeId, probe);
      if (!shift) continue;
      const date = attendanceDateFor(instantMs, shift.timing);
      const exact = date === probe ? shift : await this.forDate(employeeId, date);
      if (exact) return { shift: exact, date };
    }
    return null;
  }
}

function addDay(d: string, n: number): string {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
