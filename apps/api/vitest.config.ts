import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const db = 'trackrex_test';
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:54329/${db}`,
      DATABASE_APP_URL: `postgres://trackrex_app:trackrex_app@127.0.0.1:54329/${db}`,
      DATABASE_PLATFORM_URL: `postgres://trackrex_platform:trackrex_platform@127.0.0.1:54329/${db}`,
      DATABASE_WORKER_URL: `postgres://trackrex_worker:trackrex_worker@127.0.0.1:54329/${db}`,
      AUTH_DEV_OTP_ECHO: 'true',
      JWT_COMPANY_SECRET: 'test-company-secret-0123456789',
      JWT_PLATFORM_SECRET: 'test-platform-secret-0123456789',
      LOG_LEVEL: 'silent',
    },
  },
});
