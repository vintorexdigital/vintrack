/** One-off authoring tool: writes migrations/0011_sales_calls.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { callLogs, leads } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const known = new Set(['employees', 'customers', 'leads', 'call_logs']);
const parts = [leads, callLogs].map((k) => entitySql(k, known));
writeFileSync('migrations/0011_sales_calls.up.sql', ['-- Leads and the call log.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks)].join('\n\n') + '\n');
writeFileSync('migrations/0011_sales_calls.down.sql', [...[...parts].reverse().map((p) => p.down)].join('\n') + '\n');
console.log('wrote 0011');
