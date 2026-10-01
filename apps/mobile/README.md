# Trackrex mobile

Expo (React Native) app for employees and managers on the move: sign in, punch (with selfie and location where the shift requires them), tasks, leave, and an offline queue.

This app lives outside the pnpm workspace (`!apps/mobile` in `pnpm-workspace.yaml`) because Metro and pnpm's symlinked layout do not mix well. It has its own `package-lock.json`.

```
cd apps/mobile
npm install
npm run typecheck
EXPO_PUBLIC_API_URL=http://<your-machine>:4000 npx expo start
```

## Layout

- The offline-safe core lives in `packages/client-core` (shared with the desktop agent), imported as `@trackrex/client-core` through a tsconfig path and a Metro `watchFolders` entry. It has no React and no Expo imports. It holds the API client (token refresh, idempotency keys), the persistent offline queue, the punch and selfie flow, location batching and the sync rules. Its tests run with `pnpm --filter @trackrex/client-core test` from the repository root.
- `src/app` is Expo Router: `sign-in`, and `(app)` tabs for Today, Tasks, Leave and Profile.
- `src/session.tsx` wires the core to secure storage and the app lifecycle.

## Checking the screens without a device

```
npx expo export --platform web
node scripts/serve-web.mjs        # http://localhost:8081
CORS_EXTRA_ORIGINS=http://localhost:8081 on the API, then: npx playwright test
```

The Playwright run drives the web export in a phone-sized browser against a real API, including a punch made offline with a fake-camera selfie that is sent after reconnecting. It does not exercise native modules.

## Not done

- Background location (needs a foreground service and the background permission; tracking currently runs while the app is open).
- Push notifications, biometric lock, app-store assets (the icons are Expo placeholders), translations.
- Break start and end, regularization requests, expense claims and the activity feed screens.
- It has never been run on a physical phone or an emulator.
