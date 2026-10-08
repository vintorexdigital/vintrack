import { loadConfig } from '../src/core/config.js';
import { migrate } from '../src/core/database/migrator.js';

const dir = (process.argv[2] ?? 'up') as 'up' | 'down';
const steps = process.argv[3] ? Number(process.argv[3]) : dir === 'down' ? 1 : Infinity;
const applied = await migrate(loadConfig().DATABASE_URL, dir, steps);
console.log(applied.length ? `${dir}: ${applied.join(', ')}` : `${dir}: nothing to do`);
