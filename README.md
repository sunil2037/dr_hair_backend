# Dr. Hair API

Express.js API for the Dr. Hair Flutter app and admin panel. The backend is a modular monolith. MongoDB Atlas is the durable store when `MONGODB_URI` is set; local development can fall back to seeded in-memory data. Images and scalp photos use Cloudinary, test videos use Cloudinary, and notifications use Firebase Cloud Messaging.

The OpenAPI contract is in [`docs/openapi.yaml`](docs/openapi.yaml). The screen-based database/API design is in [`docs/DATA_ARCHITECTURE_AND_API_DESIGN.md`](docs/DATA_ARCHITECTURE_AND_API_DESIGN.md), with rollout state in [`docs/API_ROADMAP.md`](docs/API_ROADMAP.md).

## Current deployment state

`render.yaml` prepares a free Render web service in Singapore, the closest Render region to the Atlas cluster in Mumbai. No live service has been created yet: the Atlas URI is missing, Render still needs a Git source, and admin/CORS values need to be chosen. Render's free service sleeps after 15 minutes idle, takes about a minute to wake, and has an ephemeral filesystem. Use Cloudinary and Atlas for persistent files and records; use an always-on Render plan before production traffic.

## Stack

- Node.js 22 and Express.js
- MongoDB Atlas via Mongoose for durable data
- JWT bearer tokens for app sessions and admin authorization
- Cloudinary for profile/scalp images and test video uploads
- Firebase Admin SDK for FCM delivery
- OpenAPI 3.1 and Swagger UI
- No Redis dependency at this stage

## Run locally

Requirements: Node.js 22 or later and npm.

```sh
npm ci
if [ ! -f .env ]; then cp .env.example .env; fi
npm run dev
```

Set `JWT_SECRET` to a private random string of at least 32 characters. Leave `MONGODB_URI` empty only for local demo mode; that mode uses process memory and seeded data, so writes disappear when the process restarts. Production requires a valid Atlas URI and fails startup without it.

The default test OTP is available only in development. OTP requests return a generic message, and codes are HMAC-hashed in storage; the development delivery stub never logs or returns the code. Verification allows five guesses per OTP. Production rate limits are persisted in MongoDB and combine per-IP with per-login limits. No SMS/email delivery provider is configured yet, so requests outside development return `503` and production OTP sign-in is not ready.

Clinical assessment and progress photos now upload as Cloudinary `authenticated` assets and API responses use five-minute signed URLs. Existing photos uploaded before this change remain public until migrated. After connecting the Atlas URI, preview the existing asset count with `npm run media:migrate-clinical-private`; migrate assets and record metadata with `npm run media:migrate-clinical-private -- --apply`. The apply command changes Cloudinary delivery types and invalidates cached public URLs.

Keep `.env` private and out of Git. The current `.gitignore` excludes it. Render secrets belong in the Render environment settings, not in the Blueprint or source code.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Local HTTP port; Render sets its own port |
| `NODE_ENV` | Use `development` locally and `production` on Render |
| `JWT_SECRET` | JWT signing secret, at least 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime; defaults to `30d` |
| `MAX_FILE_SIZE_MB` | Maximum accepted image upload size |
| `MONGODB_URI` | MongoDB Atlas connection URI; required in production |
| `SUPER_ADMIN_ID` | Private first Super Admin login ID; required in production |
| `SUPER_ADMIN_NAME` | Display name for the bootstrap Super Admin |
| `SUPER_ADMIN_PASSWORD_HASH` | Scrypt password hash generated locally with `npm run admin:setup`; required in production |
| `CORS_ORIGINS` | Comma-separated exact browser origins for the admin panel |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary server credentials |
| `CLOUDINARY_IMAGE_FOLDER`, `CLOUDINARY_VIDEO_FOLDER` | Cloudinary folders |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin service-account credentials for FCM |
| `DEFAULT_TEST_OTP` | Development-only six-digit testing code |
| `OTP_EXPIRY_MINUTES` | OTP validity window |

## API routes

All versioned routes are listed with request/response schemas in [`docs/openapi.yaml`](docs/openapi.yaml). Swagger UI is available at `/api/docs` when the server is running; the raw contract is served from `/api/openapi.yaml`.

Main route groups:

- `/api/v1/auth/*` — request and verify a login OTP
- `/api/v1/users/*` — profile creation/update and profile photo upload
- `/api/v1/hair-tests/*` — submit an assessment with optional scalp photos and list the signed-in user's assessments
- `/api/v1/treatments/*` — read treatment history belonging to the signed-in user
- `/api/v1/reviews/*` — public active reviews and moderated review submission
- `/api/v1/notifications/*` — register/remove the signed-in user's FCM device token
- `/api/v1/videos` — public published videos
- `/api/v1/admin/*` — allowlisted admin operations for users, hair tests, treatments, reviews, videos, and per-user push notifications

Legacy Flutter-compatible paths such as `/auth/*`, `/Admin/*`, `/HairTest/*`, and `/Review/*` remain mounted. Profile registration requires the bearer token returned by OTP verification and only accepts the identity verified by that OTP.

## Render test deployment

1. Put this backend repository on the Git provider account you want to connect to Render. Review the source first: a connected branch is shared with Render and pushes can trigger deployments.
2. Create a Blueprint from the repository so Render reads `render.yaml`.
3. Add `MONGODB_URI`, `ADMIN_EMAILS`, `CORS_ORIGINS`, Cloudinary, and Firebase values as private Render environment variables.
4. Add the selected Render service region's outbound CIDR ranges to Atlas Network Access. Render's shared ranges can rotate; dedicated static egress IPs require a paid workspace. Do not allow every IP to reach Atlas.
5. Open `/health`, then `/api/docs` on the generated `onrender.com` URL.

The Atlas cluster and Cloudinary/Firebase projects are separate services; Render hosts only this Express API. Free Render is for testing and may sleep or hit monthly limits. The current smallest always-on paid web instance is listed on Render's pricing page; pricing and limits can change.

## Not wired end to end yet

Some Flutter screens and the admin panel still use mock/demo data. Their API base URLs and calls need to be connected after the test backend has a live URL. FCM registration is implemented on the server but still needs app-side API wiring. iOS notifications need APNs credentials and web notifications need VAPID setup. A real OTP delivery API is also needed before public use.
