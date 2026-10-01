import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/worker.ts', 'src/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: [/^@trackrex\//],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  esbuildOptions(o) {
    o.keepNames = true;
  },
});
