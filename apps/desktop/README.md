# Trackrex desktop agent

Electron tray app for Windows, macOS and Linux that records desktop activity (which application is in front, and idle time) while the employee is punched in, if the company has switched it on.

```
pnpm --filter @trackrex/desktop test        # agent logic: privacy filter, bucketizer, agent behaviour
pnpm --filter @trackrex/desktop build       # bundles dist/
TRACKREX_API_URL=http://localhost:4000 pnpm --filter @trackrex/desktop start
xvfb-run -a pnpm --filter @trackrex/desktop exec playwright test   # drives the real app on a virtual display
```

## Design
- `src/agent` has no Electron imports. The privacy filter (`privacy.ts`) applies the company's policy on the machine before anything is stored or sent; the server applies it again. `bucketizer.ts` turns 5-second samples into minute buckets per application. `agent.ts` records only while the server says the person is punched in and the company has the feature on, and sends through the offline queue shared with the mobile app (`packages/client-core`).
- `src/main` is the Electron main process: tray, a window that shows the employee exactly what is being collected (the transparency view), sign-in, secrets encrypted with the OS keychain via `safeStorage`.
- The window has no Node access (`contextIsolation`, sandbox, a narrow preload) and a strict content security policy.

## Not done
- Installers, code signing, notarization and auto-update.
- Screenshots, and the call-recording and website-category features in the master prompt.
- Reading the focused window needs the optional `active-win` package; on macOS it needs the Screen Recording permission for window titles. A headless Linux display has no window manager, so the end-to-end check exercises sign-in, status and the transparency view, but records no real windows.
- Starting at login (deliberately not enabled without the employee choosing it).
