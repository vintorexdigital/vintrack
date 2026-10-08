import { Body, Controller, Delete, Get, HttpCode, Inject, Module, Param, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { businessUnits, costCenters, departments, designations, employeeTypes, employmentTypes, idParam, teams, uuid, workLocations } from '@trackrex/schemas';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit.service.js';
import { Authz } from '../../core/rbac.service.js';
import { notFound } from '../../core/errors.js';
import { crudModule, crudParts, apiPathFor } from '../../shared/crud/crud.factory.js';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { CrudService } from '../../shared/crud/crud.service.js';

const plain = [workLocations, businessUnits, costCenters, employeeTypes, employmentTypes, departments, designations].map((k) => crudModule(k));

/** Teams add membership management on top of the plain CRUD routes. */
const teamParts = crudParts(teams);
const teamMemberBody = z.object({ employeeId: uuid, role: z.enum(['lead', 'member']).default('member') });

@Controller(apiPathFor(teams))
class TeamsController extends CrudController {
  constructor(@Inject(teamParts.token) service: CrudService, private readonly db: Db, private readonly authz: Authz, private readonly audit: AuditService) {
    super(service);
  }

  @Get(':id/members')
  async members(@Param() p: unknown) {
    const { id } = idParam.parse(p);
    await this.service.get(id);
    const res = await this.db.q.execute(sql`select tm.employee_id as "employeeId", tm.role, e.display_name as "displayName", e.code from team_members tm join employees e on e.id = tm.employee_id where tm.team_id = ${id}::uuid and e.deleted_at is null order by e.display_name`);
    return res.rows;
  }

  @Post(':id/members') @HttpCode(200)
  async addMember(@Param() p: unknown, @Body() body: unknown) {
    this.authz.require('org.team.update');
    const { id } = idParam.parse(p);
    const b = teamMemberBody.parse(body);
    await this.service.get(id);
    await this.db.q.execute(sql`insert into team_members (tenant_id, team_id, employee_id, role) values (app_tenant_id(), ${id}::uuid, ${b.employeeId}::uuid, ${b.role}) on conflict (tenant_id, team_id, employee_id) do update set role = excluded.role`);
    await this.audit.record({ entity: 'teams', entityId: id, action: 'member_added', changes: { employeeId: { new: b.employeeId }, role: { new: b.role } } });
    return { ok: true };
  }

  @Delete(':id/members/:employeeId') @HttpCode(204)
  async removeMember(@Param() p: unknown): Promise<void> {
    this.authz.require('org.team.update');
    const { id, employeeId } = z.object({ id: uuid, employeeId: uuid }).parse(p);
    const res = await this.db.q.execute(sql`delete from team_members where team_id = ${id}::uuid and employee_id = ${employeeId}::uuid`);
    if (!res.rowCount) throw notFound('Team member');
    await this.audit.record({ entity: 'teams', entityId: id, action: 'member_removed', changes: { employeeId: { old: employeeId } } });
  }
}

@Module({
  controllers: [TeamsController],
  providers: [teamParts.depsProvider, { provide: teamParts.token, useClass: teamParts.Service }],
})
class TeamsModule {}

@Module({ imports: [...plain, TeamsModule] })
export class OrgModule {}
