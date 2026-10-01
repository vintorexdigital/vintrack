# Deploying Trackrex

Target: one Linux host with Docker Compose (`infra/docker-compose.yml`). Nothing in the code assumes a single replica, but uploaded files live on a local volume, so do not spread the API across hosts until an object-store adapter exists.

## First deploy
1. DNS: `PRIMARY_DOMAIN`, `www`, `api.`, `platform.`, `app.` and `*.app.` pointing at the host. Wildcard certificates need a DNS-challenge Caddy build; custom domains use on-demand TLS gated by `GET /internal/domain-allowed`.
2. Copy `.env.example` to `infra/.env`. Set strong `JWT_COMPANY_SECRET` and `JWT_PLATFORM_SECRET` (`openssl rand -base64 48`), `POSTGRES_PASSWORD`, the runtime role passwords (migration 0001 creates `trackrex_app`, `trackrex_platform` and `trackrex_worker`; set their passwords to match the `DATABASE_*_URL`s), `BILLING_PROVIDER` and its keys, `AUTH_DEV_OTP_ECHO=false`. The API refuses to start in production with development secrets.
3. `docker compose -f infra/docker-compose.yml up -d --build`. The `migrate` service runs first and the API waits for it.
4. Create the first platform operator (there is no signup for staff): `docker compose -f infra/docker-compose.yml run --rm -e STAFF_PASSWORD='<12+ characters>' api node dist/create-staff.js you@example.com "Your Name" super_admin`, then sign in at `platform.<domain>`; two-factor enrolment is forced at first sign-in.
5. Check `https://api.<domain>/health`, sign in to the platform console, provision a test company, sign in to it, punch.

## Releasing
- Migrations are paired up/down SQL and run forward at deploy. Roll the application back first, then (only if a migration must be undone) `docker compose run --rm migrate node dist/migrate.js down 1`. Down migrations drop data in the tables they created; take a backup first.
- The scheduler (`worker`) is idempotent per tenant; two overlapping deploys do not duplicate invoices, punches or feed entries.
- After a deploy, check the worker log for `worker ready` and run `POST /platform/v1/jobs/outbox-relay/run` from the platform console if events look delayed.

## Not yet covered
Zero-downtime migration choreography for breaking changes, autoscaling, multi-region, and an object store for files. Monitoring and alerting are not set up in this repository.
