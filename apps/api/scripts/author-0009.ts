/** One-off authoring tool: writes migrations/0009_expenses.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { expenseCategories, expenseClaims } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const known = new Set(['employees', 'customers', 'expense_categories', 'expenses']);
const parts = [expenseCategories, expenseClaims].map((k) => entitySql(k, known));
writeFileSync('migrations/0009_expenses.up.sql', ['-- Expense categories and claims.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks)].join('\n\n') + '\n');
writeFileSync('migrations/0009_expenses.down.sql', [...[...parts].reverse().map((p) => p.down)].join('\n') + '\n');
console.log('wrote 0009');
