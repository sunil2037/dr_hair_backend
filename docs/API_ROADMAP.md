# Dr. Hair backend status and rollout plan

## Agreed stack

| Area | Choice |
|---|---|
| API | Express.js / Node.js modular monolith |
| Durable database | MongoDB Atlas, `dr-hair-dev` cluster in Mumbai |
| API hosting | Render Web Service in Singapore; free instance for testing, always-on paid instance before production |
| Images and test photos | Cloudinary |
| Test video uploads and delivery | Cloudinary; YouTube links can also be added as content |
| Push | Firebase Cloud Messaging |
| OTP testing | Development-only test OTP; production delivery provider is not selected |
| Cache | No Redis yet; add it only when a measured need appears |

## Implemented in the backend

- MongoDB-backed repositories for users, OTPs, hair tests, treatment plans, reviews, device tokens, and video metadata. Local development can use seeded in-memory data when `MONGODB_URI` is absent; production startup requires MongoDB.
- JWT authentication, verified-login profile creation, user-owned treatment history, and password-backed admin accounts with Super Admin role checks.
- Cloudinary storage for profile and scalp images. Admin video routes create signed Cloudinary uploads, verify the uploaded asset, and keep it as a draft until published.
- Patient report upload, share/hide access controls, visibility history, 30-day soft-delete recovery and restore; expired reports are permanently purged by the archive service.
- Patient-owned progress check-in list/create/delete APIs. Progress photos use the shared `POST /api/v1/media/upload` endpoint with `X-Media-Purpose: progress`; clinical images are authenticated Cloudinary assets and are exposed through expiring signed URLs. The check-in API verifies asset ownership and reads actual asset metadata from Cloudinary.
- Admin patient-detail response includes archived reports, appointments, clinical activity, and daily progress check-ins so the page can load its sections in one API request.
- Public YouTube video entries, published video listing, review moderation, patient/hair-test/treatment admin routes, and FCM device-token registration and admin send-to-user routes.
- OpenAPI contract and Swagger UI at `/api/openapi.yaml` and `/api/docs`.
- Shared MongoDB-backed production rate limits for OTP, admin login, reviews, and media upload; OTP challenges allow a maximum of five wrong codes and are consumed atomically.
- A Render Blueprint in `render.yaml` with the Node runtime, health check, generated JWT secret, and placeholders for private environment variables.

## Current blockers before a live deployment

1. The Atlas cluster is active, but this backend has no `MONGODB_URI` in `backend/.env`. The existing Atlas database user's password cannot be retrieved from the console; it must be reset or replaced by the account owner and the resulting URI stored locally in `backend/.env` or in Render's secret settings.
2. Atlas Network Access still needs an allowlist entry that permits Render to connect. Add the Render service's current outbound CIDR ranges for its chosen region. Render shares those ranges across services and may rotate them; dedicated static egress IPs require a paid Render workspace. Do not open Atlas to every IP.
3. The Render service is prepared locally but has not been created or deployed. A Git source/branch must be selected and shared with Render to publish the code.
4. `CORS_ORIGINS` needs the exact deployed admin-panel origin.
5. OTP delivery outside development needs a real email/SMS OTP API. The development test OTP must never be enabled on the public production service.
6. The admin panel and Flutter app still use demo/mock flows in places. They need API base URLs and calls wired to the documented endpoints before those screens use live data. The FCM token registration endpoint is ready, but app-side registration is not yet connected end to end. iOS push also needs APNs credentials; web push needs VAPID configuration.
7. Set `SUPER_ADMIN_ID`, `SUPER_ADMIN_NAME`, and `SUPER_ADMIN_PASSWORD_HASH` in Render before deployment. Production now refuses to start with missing Super Admin credentials or a missing Atlas URI.
8. Existing assessment/progress images need the documented Cloudinary migration run once. Until it is applied, previously uploaded photos still have their old public delivery URLs.

## Current API coverage

Implemented endpoints are listed in [`openapi.yaml`](openapi.yaml). Current backend scope covers sign-in/profile, hair assessments, treatment history, report sharing and recovery, daily progress check-ins, appointments, public reviews, videos, push-token handling, and admin APIs for users, assessments, treatment plans, review moderation, videos, and per-user push messages.

Appointments, shop products and inventory, cart/checkout/orders, coupons/referrals, dashboard analytics, scheduled/broadcast notifications, roles beyond the single admin allowlist, and audit logs remain future work. Those business rules should be agreed before adding those API resources.

## Deployment path

1. Add the missing local/private configuration and verify Atlas access.
2. Review which project files will be shared with Render, connect the selected Git repository, and create the free test web service from `render.yaml`.
3. Add production secrets and the intended admin/CORS settings in Render. Check `/health`, `/api/docs`, OTP/auth, Mongo persistence, Cloudinary upload, and FCM delivery.
4. Connect Flutter and the admin panel to the Render URL, then replace the free sleeping service with an always-on plan when the app is ready for normal use.

See [`DATA_ARCHITECTURE_AND_API_DESIGN.md`](DATA_ARCHITECTURE_AND_API_DESIGN.md) for the screen-by-screen API inventory and proposed MongoDB collection model.
