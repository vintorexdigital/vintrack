import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: { include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/index.ts'], thresholds: { branches: 85 } },
  },
});
