import { defineConfig, devices } from '@playwright/test';

/** Runs the Expo web export in a phone-sized browser. It checks the shared logic and screens, not native modules. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.MOBILE_WEB_URL ?? 'http://localhost:8081',
    ...devices['Pixel 7'],
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    permissions: ['geolocation', 'camera'],
    geolocation: { latitude: 13.0827, longitude: 80.2707, accuracy: 15 },
  },
});
