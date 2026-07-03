# Class Zoom Calendar

Production-ready Next.js app for one school to publish dated Zoom class links to parents behind a shared school access code.

## What it includes

- Parent access-code gate at `/access`
- Parent calendar at `/calendar`
- Administrator login at `/admin/login`
- Administrator class management at `/admin/classes`
- Administrator school/access-code settings at `/admin/settings`
- Supabase schema with locked-down RLS, service-role-only table access, and rate-limited parent access attempts

## Required environment variables

Copy `.env.example` to `.env.local` for local development, or configure the same values in production:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PARENT_SESSION_SECRET=
ADMIN_USER_ID=
REQUEST_FINGERPRINT_SECRET=
```

Notes:

- `ADMIN_USER_ID` must be the immutable Supabase Auth user id for the single administrator/teacher.
- `PARENT_SESSION_SECRET` and `REQUEST_FINGERPRINT_SECRET` should be long random secrets.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code.

## Supabase setup

Apply the migration in `supabase/migrations/202606220001_initial_schema.sql`.

The migration creates and locks down:

- `school_settings`
- `classes`
- `parent_access_attempts`
- `consume_parent_access_attempt(...)`

It also seeds the singleton `school_settings` row with `Class Calendar School` and `UTC`; update these in `/admin/settings` after deployment.

## Administrator setup

1. Create the administrator/teacher user in Supabase Auth.
2. Set `ADMIN_USER_ID` to that user’s id.
3. Sign in at `/admin/login`.
4. Go to `/admin/settings` and set:
   - school display name
   - timezone
   - parent session duration
   - shared family/school access code
5. Add classes at `/admin/classes`.

## Local development

```bash
npm install
npm run dev
```

## Verification

Run the full production gate:

```bash
npm run typecheck
npm run lint
npm test
SUPABASE_SERVICE_ROLE_KEY=boundary-test-secret npm run build
git diff --check
```

`npm run build` also runs `scripts/verify-build-boundaries.mjs`, which verifies the expected privileged server actions and checks static client assets for privileged server markers.

## Deployment

Deploy as a standard Next.js app. Configure all required environment variables in the hosting platform before first production build.

After deployment, use `/admin/settings` to rotate the parent access code whenever needed. The code is stored only as a bcrypt hash and is never rendered back to the UI.
