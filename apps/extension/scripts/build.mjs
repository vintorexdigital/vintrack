// Bundles the service worker and popup, and writes a manifest that can reach only the configured API.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const api = process.env.TRACKREX_API_URL ?? 'http://localhost:4000';
const define = { __API_URL__: JSON.stringify(api) };
mkdirSync('dist', { recursive: true });
await build({ entryPoints: { background: 'src/background.ts' }, bundle: true, format: 'esm', target: 'chrome120', outdir: 'dist', define, logLevel: 'info' });
await build({ entryPoints: { popup: 'src/popup.ts' }, bundle: true, format: 'iife', target: 'chrome120', outdir: 'dist', define, logLevel: 'info' });
cpSync('src/popup.html', 'dist/popup.html');
cpSync('src/popup.css', 'dist/popup.css');
cpSync('icons', 'dist/icons', { recursive: true });
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.host_permissions = [`${new URL(api).origin}/*`];
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
