---
name: backend-api-architecture
description: Design or extend Dr Hair Express API modules, authentication, MongoDB persistence, and contracts consumed by Flutter and the admin panel.
---

# Backend API Architecture

Use this skill when changing backend routes, auth/profile flows, persistence, or APIs consumed by Flutter and the admin panel.

## Preserve the backend boundaries

- Read `README.md`, `docs/API_ROADMAP.md`, `docs/openapi.yaml`, and the relevant module before editing. This is an Express modular monolith with feature-owned application, domain, infrastructure, and presentation layers.
- Keep route/controller code thin. Put business rules in application use cases, persistence and provider calls behind infrastructure interfaces, and construct dependencies in the existing container.
- Reuse existing validation, response, error, auth, upload, and configuration patterns. Do not add a second container, global mutable request state, or provider calls inside controllers.
- MongoDB Atlas is the durable store. Keep production behavior fail-closed when required configuration is missing; do not silently fall back to process memory in production.

## Identity, authorization, and data

- Derive patient identity from the verified bearer token, never from a caller-supplied user ID. Scope profile and clinical queries to that identity unless an explicit admin permission authorizes broader access.
- Admin UI visibility is not authorization. Protect every admin operation in the API and preserve the current server-side allowlist/claims model unless the task explicitly changes it.
- Validate and normalize login identifiers consistently. Keep OTP expiry, attempt limits, and rate limiting on the server.
- Treat assessment photos and profile data as sensitive. Avoid public media delivery, broad data exposure, and logging request bodies or credentials.
- Keep configuration in environment variables and examples in `.env.example`; never commit `.env`, private keys, provider tokens, or real patient records.

## Contract changes

- Treat `docs/openapi.yaml` as the client-facing contract. Update it when paths, auth, request/response fields, status codes, or error behavior change.
- Check both Flutter API use and admin API use before changing an existing endpoint. Preserve legacy aliases while they remain part of the documented client contract.
- Prefer explicit, backward-compatible response shapes and stable identifiers. Do not claim an operation is persistent unless its repository uses the configured database.
