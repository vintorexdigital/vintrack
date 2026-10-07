# 0013 Envelope encryption of location data and selfies

Status: accepted

## Context
Home location, location history and selfies are the most sensitive data Trackrex holds. Row-level security keeps companies apart but does nothing against a database dump, a stolen backup or an operator with SQL access. The master prompt asks for envelope encryption.

## Decision
Key hierarchy: **master key** (in the key service) wraps a per-company **data key** (DEK, AES-256) which seals the data (AES-256-GCM).
- `KmsProvider` has `wrap`/`unwrap` and nothing else. The only implementation is `LocalKms`: master keys in `KMS_MASTER_KEYS` (`id:base64,...`, first is current). **This is a software key service, not an HSM**: anyone who can read the API process environment can read everything. Pointing the interface at AWS KMS, GCP KMS or Vault is a new provider class, not a data migration.
- `tenant_keys` holds wrapped DEKs by version. Rotation (`POST /company/encryption/rotate`) starts a new version; older versions stay for reading. A new master key is added at the front of `KMS_MASTER_KEYS`, and the `rewrap-keys` job re-wraps every DEK under it; retired master keys may then be removed.
- Sealed form: `TRX1 | key version | iv | tag | ciphertext`, authenticated against `<company id>|<purpose>`. A sealed value cannot be moved to another company or field. Selfies add their file key to the purpose.
- Keys are created and read on a separate short transaction so a rolled-back request cannot lose a key that data was sealed with. Unwrapped keys are cached in memory for 5 minutes.

What is sealed: home location (`employee_private`), location points (`location_pings.sealed`), the live position (`live_locations.sealed`), selfie image bodies in the file store.

What is deliberately not sealed: punch coordinates (attendance reports and audits need them), customer addresses and task check-in positions (the business's own data, searched and printed), activity buckets (already privacy-filtered on the device).

## Consequences
- The database can no longer compute over location. The field-travel report now reads, opens and computes in code (same `cleanTrack`/`trackDistanceMeters` rules as the trail). It is capped at 300,000 points per run.
- Legacy plaintext (written before sealing, or while `ENVELOPE_ENCRYPTION=false`) is sealed by the `seal-legacy-locations` job; reads accept both forms. `employees.home_latitude/home_longitude` remain as legacy columns that are always emptied (the drift test pins the original table DDL).
- Turning `ENVELOPE_ENCRYPTION` off stops sealing new data; sealed data stays readable as long as the keys exist. Losing the master keys loses the data: back them up separately from the database (see the backup runbook).
- The company export opens sealed values for the company that owns them.
- Not done: per-read audit of who viewed a trail, searchable encryption, customer-held keys.
