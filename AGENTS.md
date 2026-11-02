# Dr. Hair backend guidance

- Read `README.md`, `docs/API_ROADMAP.md`, `docs/openapi.yaml`, and the relevant module before editing. Keep controllers thin and follow existing module/container/repository patterns.
- Derive patient identity from the verified token, never from a client-supplied patient ID. Preserve ownership checks, admin authorization, OTP expiry/attempt limits, rate limits, and safe error responses.
- MongoDB Atlas is the durable production store. Do not silently substitute in-memory storage in production. Keep tests isolated from Atlas, Cloudinary, Firebase, and real OTP delivery.
- Treat clinical photos and patient data as sensitive. Use the existing media upload flow and access controls. Do not log secrets, OTPs, bearer tokens, or clinical request bodies.
- Update `docs/openapi.yaml` for API contract changes and check Flutter/admin consumers before changing a shared route.
- Preserve existing user modifications. Run focused tests, the full backend test/build checks relevant to the change, and review the final diff.
- `npm run deploy` can push code and deploy production. Do not run deployment or push commands unless the user explicitly requests that action.
