import { Controller, Get, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from '../../core/database/db.service.js';
import { currentAuth } from '../../core/context.js';
import { SettingsService } from '../../core/settings.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';

/** Numbers behind the Home widgets. Each block is scoped to what the viewer may see. */
@Controller('home')
class HomeController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly settings: SettingsService) {}

  @Get('summary')
  async summary() {
    const auth = currentAuth();
    const today = new Date().toISOString().slice(0, 10);
    const out: Record<string, unknown> = { date: today };

    if (this.authz.has('attendance.day.read')) {
      const pred = this.scope.predicate(this.authz.require('attendance.day.read'), sql`d.employee_id`);
      const res = await this.db.q.execute(sql`
        select count(*) filter (where d.status_code in ('P','AP','HP') or d.secondary_code = 'HP')::int as present,
               count(*) filter (where d.status_code in ('AB','OA','AH') or d.secondary_code = 'AH')::int as absent,
               count(*) filter (where d.status_code in ('L','HL','PUL'))::int as leave,
               count(*) filter (where d.late_mark)::int as late,
               count(*)::int as total
        from attendance_days d join employees e on e.id = d.employee_id where d.date = ${today}::date and e.status = 'active' ${pred ? sql`and ${pred}` : sql``}`);
      out.attendance = res.rows[0];
      const livePred = this.scope.predicate(this.authz.require('attendance.punch.read'), sql`p.employee_id`);
      const live = await this.db.q.execute(sql`
        select count(*)::int as n from (select distinct on (p.employee_id) p.employee_id, p.type from punches p where p.at > now() - interval '20 hours' ${livePred ? sql`and ${livePred}` : sql``} order by p.employee_id, p.at desc) x where x.type = 'in'`).catch(() => ({ rows: [{ n: 0 }] }));
      out.punchedIn = (live.rows[0] as { n: number }).n;
    }

    if (this.authz.has('leave.request.approve') || this.authz.has('attendance.regularization.approve')) {
      const approvals: Record<string, number> = {};
      if (this.authz.has('leave.request.approve')) {
        const p = this.scope.predicate(this.authz.require('leave.request.approve'), sql`r.employee_id`);
        approvals.leave = ((await this.db.q.execute(sql`select count(*)::int as n from leave_requests r where r.status = 'pending' and r.deleted_at is null ${p ? sql`and ${p}` : sql``}`)).rows[0] as { n: number }).n;
      }
      if (this.authz.has('attendance.regularization.approve')) {
        const p = this.scope.predicate(this.authz.require('attendance.regularization.approve'), sql`r.employee_id`);
        approvals.regularization = ((await this.db.q.execute(sql`select count(*)::int as n from regularizations r where r.status = 'pending' and r.deleted_at is null ${p ? sql`and ${p}` : sql``}`)).rows[0] as { n: number }).n;
      }
      out.approvals = approvals;
    }

    const hide = {
      holiday: await this.settings.get<boolean>('account.hide_holiday_widget', false),
      birthday: await this.settings.get<boolean>('account.hide_birthday_widget', false),
      anniversary: await this.settings.get<boolean>('account.hide_anniversary_widget', false),
    };
    if (!hide.holiday) {
      out.holidays = (await this.db.q.execute(sql`select name, start_date as "startDate", end_date as "endDate" from holidays where deleted_at is null and end_date >= ${today}::date and optional = false order by start_date limit 5`)).rows;
    }
    if (!hide.birthday && this.authz.has('hr.employee.read')) {
      out.birthdays = (await this.db.q.execute(sql`
        select display_name as name, date_of_birth as "dateOfBirth" from employees
        where deleted_at is null and status = 'active' and date_of_birth is not null
          and (to_char(date_of_birth, 'MM-DD') between to_char(${today}::date, 'MM-DD') and to_char(${today}::date + 14, 'MM-DD'))
        order by to_char(date_of_birth, 'MM-DD') limit 8`)).rows;
    }
    out.me = { employeeId: auth.employeeId ?? null };
    return out;
  }
}

@Module({ controllers: [HomeController] })
export class HomeModule {}
