# Trackrex browser extension (Chrome, Edge; Manifest V3)

Records which website is in front, one sample a minute, only while the employee is punched in and only if the company has desktop activity switched on. It exists for the website part of the Productivity module on machines where the desktop agent cannot read the browser's address (it can on macOS only).

```
pnpm --filter @trackrex/extension build         # TRACKREX_API_URL=https://api.example.com to point it at a server
pnpm --filter @trackrex/extension test          # sampler logic
xvfb-run -a pnpm --filter @trackrex/extension exec playwright test   # loads the unpacked extension in Chromium
```

Load `dist/` as an unpacked extension (chrome://extensions, Developer mode).

## What it does and does not do
- Sends the site name (or the full URL if the company allows it), never page contents, titles, form data or anything typed.
- Skips browser-internal pages, extension pages, local files and anything while the browser is not the focused window. Private (incognito) windows are not recorded because the extension is not enabled there by default.
- Counts a minute as idle when the computer has been idle for two minutes or is locked.
- The manifest's host permission is limited to the configured API origin at build time.
- Sign-in uses the same rotating refresh tokens as the other apps; the token is kept in `chrome.storage.local`, which is not encrypted at rest beyond what the browser profile provides.

## Not done
Chrome Web Store packaging, Firefox and Safari builds, a policy for managed (enterprise) deployment, and translations.
