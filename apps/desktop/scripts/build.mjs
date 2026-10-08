// Bundles the Electron main process and preload (the workspace core ships as TypeScript source) and copies the window.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, external: ['electron', 'active-win'], logLevel: 'info' };
await build({ ...common, entryPoints: ['src/main/main.ts'], format: 'esm', outfile: 'dist/main/main.js', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
await build({ ...common, entryPoints: ['src/main/preload.ts'], format: 'cjs', outfile: 'dist/main/preload.cjs' });
mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer', 'dist/renderer', { recursive: true });
