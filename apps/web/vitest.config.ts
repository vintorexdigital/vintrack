import { defineConfig } from 'vitest/config';

// Playwright specs live in e2e/ and are run by `playwright test`, never by vitest.
export default defineConfig({ test: { exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**', 'out/**'], passWithNoTests: true } });
