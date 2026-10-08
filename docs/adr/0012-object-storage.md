# 0012 Object storage behind one interface

Status: accepted

## Context
Selfies were written to local disk, so two API hosts could not share files. The master prompt asks for stateless API nodes.

## Decision
- `StorageProvider` (`put`, `get`, `exists`) stays the only way code touches files. Two implementations: `LocalDiskStorage` and `S3Storage`.
- `S3Storage` speaks the S3 REST API with Signature V4 using `node:crypto` and `fetch`. No SDK: three calls are all we need, and an SDK is a large dependency tree to audit.
- `STORAGE_DRIVER=disk|s3` selects at boot; `s3` fails fast if endpoint, bucket or keys are missing.
- Keys are identical across providers (`selfies/<tenant>/<user>/<id>.jpg`), so moving from disk to S3 is a copy.
- Access control stays in the API (the bucket is private; clients never get bucket URLs).

## Verification, honestly
Tested against an in-process S3 double (`apps/api/test/mock-s3.ts`) that recomputes the signature for each request and rejects mismatches. **Not run against AWS S3, MinIO or R2.** Pre-signed URLs, multipart upload, server-side encryption headers and lifecycle rules are not implemented.

## Consequences
Only path-style and virtual-host addressing are supported; large files (>5 GB) are out of scope. Envelope encryption of file bodies is a separate decision (ADR 0013).
