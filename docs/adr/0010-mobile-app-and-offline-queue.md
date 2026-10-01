# 0010. Mobile app: standalone Expo project, an offline queue in a plain-TypeScript core

Status: accepted

## Decisions
- **Standalone project.** `apps/mobile` is excluded from the pnpm workspace and uses npm with its own lockfile. Metro resolving symlinked pnpm packages is a known source of breakage and the app needs none of the workspace packages at runtime (types are copied, the API is the contract).
- **A core with no framework imports.** `src/core` (API client, offline queue, punch flow, location batching) imports nothing from React or Expo and is tested with vitest against a scripted fake server. Screens are thin. This is where the behaviour that matters lives, and it can be tested without a device.
- **Every change carries an idempotency key, and the queue item id is that key.** A punch that was sent but whose response was lost is replayed by the server, not repeated. The API client reuses one key across its refresh-and-retry.
- **Offline punches keep the tap time.** Online, the server stamps the time. If the server cannot be reached the punch is stored with the tap time and `offline: true` (the only way the API accepts a client time) and sent later under the same key. A new punch made while a backlog exists queues behind it so order is preserved.
- **Refusals do not block.** Network errors, 5xx, 429 and "request in progress" stop a flush and keep everything. A clear refusal (validation, a shift rule, permission) moves only that item to a "needs attention" list that the person sees and can dismiss. Background location batches are dropped quietly instead.
- **Selfies.** The API stores JPEGs under `selfies/<tenant>/<user>/<uuid>.jpg` (local-disk storage behind a `StorageProvider` interface; no S3 adapter yet). The client chooses the file name, the server fixes the folder from the signed-in identity, so a punch made offline can name its selfie before it is uploaded. A punch that names a selfie not yet on the server is refused (`selfie_not_uploaded`). Offline, the photo is stored in the app's documents folder (not the secure store, which is too small) and its upload is queued ahead of the punch.
- **Location is foreground only for now.** It runs while the app is open and the person is punched in, at the interval the company set. The server still decides what to keep (ADR 0008).
- **Session offline.** The refresh token is in the platform secure store. If the app starts without a connection it opens with the last known profile so the person can still punch; the first request after reconnecting refreshes the session.

## Found by running it in a browser
The unit tests passed while the first real sign-in failed: `fetch` stored as a property and called as a method throws "Illegal invocation" in browsers. The client now wraps it, with a regression test that uses a fetch which refuses a foreign `this`. The same run showed the Today screen guessing "not punched in" before the server answered, and the web camera returning PNG by default; both are fixed.

## Not verified
Native modules (secure store, file system, camera, location permissions and behaviour) have not run on a device or emulator. The web export used for checks substitutes localStorage and the browser's camera and geolocation.
