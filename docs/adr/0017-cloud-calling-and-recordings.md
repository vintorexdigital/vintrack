# 0017 Cloud calling and call recordings

Status: accepted

## Decision
- **Click-to-call through a provider**: an employee asks to call a customer or lead; the provider rings the *employee's* phone first and then bridges the customer. We never handle audio; the provider does. The employee needs a mobile number on their employee record.
- `TelephonyProvider` (`dial`, `hangup`, `parseWebhook`, `fetchRecording`). Implementations: `MockTelephony` (default) and `ExotelTelephony`. `TELEPHONY_PROVIDER` chooses; a company turns calling on with the `calls.provider` setting.
- **Mock mode places no call.** A call moves along when the person presses the *Simulate* buttons in the console (a stand-in for the provider's status callbacks), a "recording" is a synthetic tone pattern, and the UI and the call record say "mock". Exotel is tested against a stubbed `fetch` and sample callbacks only, never against Exotel.
- Provider callbacks arrive on `POST /webhooks/telephony/:provider?t=<company>&token=...`; the shared token is checked in constant time and the company is named in the address (callbacks have no sign-in). Events are idempotent: a late or repeated callback on a finished call changes nothing.
- A finished call writes the usual **call log** row, linked to the customer or lead, so reports and lists need no second source.
- **Recordings** are off unless the company turns them on, announce themselves to the customer (a setting, passed to the provider), are sealed in storage (ADR 0013), are deleted after a retention period (default 90 days, the `purge-recordings` job; the call stays, marked "recording removed"), and every listen is written to the audit log. Who may listen follows data scope: the caller, their managers, administrators. Support sessions cannot.

## Not built
Incoming calls and missed-call capture, call transcription, in-browser softphone, automatic capture of calls made on the phone's own dialler, call masking/number pools, a second provider (CallerDesk), speech analytics, consent capture per customer. Mobile has no calling screen (web only).
