# Admin sign-in

The admin panel uses a separate email/admin-ID and password flow. Patient OTP authentication cannot issue an admin role.

## Initial Super Admin

Run `npm run admin:setup` from the backend folder in a private terminal. It prompts for the Super Admin ID and password without echoing the password, hashes it with scrypt, and stores only the hash in the ignored, owner-only `backend/.env` file. Restart the backend after changing this bootstrap account.

## Creating admin logins

Sign in as Super Admin, open **Management → Admin users**, and enter a staff member’s name and work email. The panel generates a temporary password and shows it once alongside the email login ID. Share it privately; the panel does not email credentials. Password hashes are stored in the `admin_accounts` MongoDB collection.

MongoDB must be configured for generated staff accounts to persist across backend restarts. Development without `MONGODB_URI` uses the same temporary in-memory fallback as the rest of the backend.

## Session and role enforcement

The Next.js server route forwards login to `POST /api/v1/admin-auth/login` and stores the returned JWT in an HTTP-only, same-site cookie. Admin JWTs expire after 12 hours. Admin and Super Admin can use admin APIs; only `super_admin` can list or create admin accounts. The dashboard reads the authenticated role from `GET /api/v1/admin/me`.
