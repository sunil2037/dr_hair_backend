---
name: backend-api-testing
description: Plan or add deterministic tests for Dr Hair Express routes, use cases, persistence boundaries, and authorization behavior.
---

# Backend API Testing

Use this skill when backend test coverage or verification is requested, especially for auth, profile ownership, admin access, uploads, and MongoDB-backed behavior.

## Choose a safe test boundary

- Inspect `package.json`, current test files, and the test environment before choosing a runner. Reuse installed tooling; avoid introducing a new framework without a concrete need.
- Keep unit tests focused on use-case rules with fake repositories/providers. Use HTTP-level tests for route wiring, middleware, validation, response shape, and status codes.
- Tests must use isolated fixtures and deterministic clocks/OTP providers. Do not connect to a real Atlas cluster, Cloudinary account, Firebase project, or external SMS/email service.
- Never print secret environment values, OTPs, bearer tokens, or sensitive clinical payloads in test logs or snapshots.

## High-value invariants

- Unauthenticated requests are rejected; verified identity is taken from the token, and users cannot read or mutate another user's profile or assessments by changing request IDs.
- Admin routes reject ordinary user tokens and enforce authorization on the server.
- OTPs expire, failed attempts are bounded, and rate limiting is applied to send and verify paths.
- Validation errors and provider failures return the established error shape without leaking internals.
- Repository tests distinguish configured Mongo persistence from development memory fallback and clean up fixtures reliably.

When running verification, report the exact commands and distinguish new failures from existing failures. Do not mark implementation verified from static inspection alone.
