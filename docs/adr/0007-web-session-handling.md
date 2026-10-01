# ADR 0007: Browser sessions

**Decision.** The access token (15 minutes) lives in memory; the rotating refresh token lives in an httpOnly, SameSite cookie scoped to `/v1/auth`. On load the console calls refresh to restore the session, and one in-flight refresh is shared so parallel requests cannot trip reuse detection (a reused refresh token revokes its whole family). Apps receive the refresh token in the response body and keep it in secure storage. Every mutation from the apps must send an `Idempotency-Key`; the web sends one where a retry could duplicate.

**Consequences.** No token in `localStorage`, so an XSS bug cannot lift a long-lived credential. Cross-origin development needs `credentials: 'include'` and the API's CORS origin list, both configured.
