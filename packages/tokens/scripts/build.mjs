import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
execFileSync('pnpm', ['exec', 'tsx', 'scripts/generate.ts'], { cwd: root, stdio: 'inherit' });
