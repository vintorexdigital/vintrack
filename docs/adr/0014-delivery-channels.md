# 0014 SMS, WhatsApp and push delivery

Status: accepted

## Context
Notifications reached people in-app and by email. The master prompt also asks for SMS, WhatsApp and push.

## Decision
- One `ChannelRouter` implements the existing `MessagingProvider` interface and holds one provider per channel. Existing callers (OTP, invitations, notifications) did not change.
- Providers: email = SMTP (or the console logger); SMS/WhatsApp = `TwilioMessaging` or the mock; push = `ExpoPushMessaging` or the mock. `SMS_PROVIDER`, `WHATSAPP_PROVIDER`, `PUSH_PROVIDER` choose; **the default is mock**.
- **Mock providers deliver nothing.** They keep the message in memory and write it to the company's message log. The UI says so wherever the channel is shown (preferences, message log). A recipient number ending `0000` simulates a rejection so the failure path can be seen.
- `deliver()` decides recipients per person: email on by default, push on by default (only reaches registered devices), SMS and WhatsApp are opt-in (cost and consent). SMS needs a mobile number from the user or the employee record.
- Every attempt, sent or failed, is a row in `message_log` with the provider that handled it. Failures never block the event; the in-app notification stays the record. Rows are purged after 90 days. Viewing the log needs `company.messages.read` and is closed to support sessions.
- Push devices are registered per user and company (`push_devices`). A token the provider reports as unregistered is revoked.
- Rendering: SMS is clipped to one 160-character segment; WhatsApp uses a fixed template name with variables; push carries a deep link.

## Verification, honestly
Twilio and Expo adapters are tested against a stubbed `fetch` (request shape, auth, error mapping), **never against the live services**. Not built: delivery receipts and webhooks, SMS DLT template registration (India), WhatsApp template approval, per-event-type preferences, quiet hours, digests, and the mobile app does not register its push token yet.
