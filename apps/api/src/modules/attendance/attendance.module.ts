import { Body, Controller, Delete, Get, HttpCode, Inject, Module, Param, Post, Query, Put, StreamableFile, Res } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { breakBody, idParam, isoDate, regularizations, uuid } from '@trackrex/schemas';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudParts } from '../../shared/crud/crud.factory.js';
import { TimeModule } from '../time/time.module.js';
import { AttendanceEngine } from './attendance-engine.service.js';
import { AttendanceService } from './attendance.service.js';
import { PunchesService } from './punches.service.js';
import { REGULARIZATIONS_SERVICE, RegularizationsService } from './regularizations.service.js';
import { Authz } from '../../core/rbac.service.js';

const regParts = crudParts(regularizations, { service: RegularizationsService });

@Controller('attendance')
class AttendanceController {
  constructor(private readonly punches: PunchesService, private readonly attendance: AttendanceService) {}

  @Post('punches') punch(@Body() body: unknown) { return this.punches.punch(body); }
  @Get('punches') listPunches(@Query() q: Record<string, string>) { return this.punches.list(q); }
  @Get('status') status() { return this.punches.myStatus(); }
  @Post('breaks/start') startBreak(@Body() body: unknown) { return this.punches.startBreak(breakBody.parse(body ?? {}).breakTypeId); }
  @Post('breaks/end') @HttpCode(200) endBreak() { return this.punches.endBreak(); }
  @Post('auto-punch-out/run') @HttpCode(200)
  async runAutoPunchOut() { return { closed: await this.punches.autoPunchOut() }; }

  @Get('days') days(@Query() q: Record<string, string>) {
    const { from, to, employeeId } = z.object({ from: isoDate, to: isoDate, employeeId: uuid.optional() }).parse(q);
    return this.attendance.list({ from, to, ...(employeeId ? { employeeId } : {}) });
  }
  @Get('days/:employeeId/:date') day(@Param() p: unknown) {
    const { employeeId, date } = z.object({ employeeId: uuid, date: isoDate }).parse(p);
    return this.attendance.day(employeeId, date);
  }
  @Put('days/:employeeId/:date/override') override(@Param() p: unknown, @Body() body: unknown) {
    const { employeeId, date } = z.object({ employeeId: uuid, date: isoDate }).parse(p);
    return this.attendance.setOverride(employeeId, date, body);
  }
  @Delete('days/:employeeId/:date/override') clearOverride(@Param() p: unknown) {
    const { employeeId, date } = z.object({ employeeId: uuid, date: isoDate }).parse(p);
    return this.attendance.clearOverride(employeeId, date);
  }
  @Post('rerun') @HttpCode(200) rerun(@Body() body: unknown) { return this.attendance.rerun(body); }
  @Post('lock') @HttpCode(200) lock(@Body() body: unknown) {
    const b = z.object({ from: isoDate, to: isoDate, locked: z.boolean().default(true) }).parse(body);
    return this.attendance.lockCycle(b.from, b.to, b.locked);
  }

  @Get('register') register(@Query() q: Record<string, unknown>) { return this.attendance.register(q); }

  @Get('register/export')
  async exportRegister(@Query() q: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const reg = await this.attendance.registerExport(q);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance register');
    ws.addRow(['Code', 'Employee', ...reg.days.map((d) => d.date.slice(8)), 'P', 'A', 'L', 'HL', 'H', 'PA', 'HP', 'AH', 'AP', 'D', 'NW', 'Payable days', 'Overtime (min)']);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    for (const r of reg.rows) {
      const s = r.summary;
      ws.addRow([r.employee.code, r.employee.name, ...reg.days.map((d) => r.cells[d.date]?.code ?? ''), s.P, s.A, s.L, s.HL, s.H, s.PA, s.HP, s.AH, s.AP, s.D, s.NW, r.payableDays, r.overtimeMinutes]);
    }
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${reg.cycle.start}-to-${reg.cycle.end}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return new StreamableFile(Buffer.from(await wb.xlsx.writeBuffer()));
  }
}

@Controller(apiPathFor(regularizations))
class RegularizationsController extends CrudController {
  constructor(@Inject(REGULARIZATIONS_SERVICE) protected override readonly service: RegularizationsService) {
    super(service);
  }
  @Post('approve') @HttpCode(200) bulkApprove(@Body() body: unknown) { return this.service.bulkApprove(body); }
  @Post(':id/approve') @HttpCode(200) approve(@Param() p: unknown, @Body() body: unknown) { return this.service.approve(idParam.parse(p).id, body); }
  @Post(':id/reject') @HttpCode(200) reject(@Param() p: unknown, @Body() body: unknown) { return this.service.reject(idParam.parse(p).id, body); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param() p: unknown) { return this.service.cancel(idParam.parse(p).id); }
}

@Module({
  imports: [TimeModule],
  controllers: [AttendanceController, RegularizationsController],
  providers: [AttendanceEngine, AttendanceService, PunchesService, regParts.depsProvider, { provide: REGULARIZATIONS_SERVICE, useClass: RegularizationsService }, Authz],
  exports: [AttendanceEngine, PunchesService, AttendanceService],
})
export class AttendanceModule {}
