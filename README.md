# Class Zoom Calendar

Production-ready Next.js app for one school to publish dated Zoom class links to parents behind a shared school access code.

## What it includes

### For parents

- Access-code gate at `/access` with database-backed rate limiting
- Calendar at `/calendar` with agenda and month views (month cells show class titles; clicking a day shows that day's classes)
- "Happening now" / "Starts in N min" badges and an emphasized "Join now" button around class time
- "Add to calendar" per-class `.ics` download
- A tokenized ICS subscription feed parents can add to Google Calendar, Apple Calendar, or Outlook
- Optional daily email reminders with one-click unsubscribe

### For administrators

- Login at `/admin/login` (Supabase Auth)
- Class management at `/admin/classes`: create, edit, cancel/restore, duplicate to next week, delete, and search
- Weekly recurring classes ("repeats weekly until…") with "this class only / this and future classes" edit and delete scopes
- CSV bulk import at `/admin/classes/import`
- Settings at `/admin/settings`: school name, timezone, parent session duration, shared access code, calendar-feed link, and administrator management (multiple admins)

### Security posture

- Supabase schema with locked-down RLS; all table access is service-role-only
- Rate-limited parent access attempts enforced atomically in the database (stale rows self-prune)
- Parent sessions are signed JWTs; the access code is stored only as a bcrypt hash
- Zoom URLs are validated against an https + zoom.us host allowlist in both the database and the app
- `npm run build` runs `scripts/verify-build-boundaries.mjs`, which pins the exact set of privileged server actions and scans client assets for privileged server markers

## Required environment variables

Copy `.env.example` to `.env.local` for local development, or configure the same values in production:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PARENT_SESSION_SECRET=
ADMIN_USER_ID=
REQUEST_FINGERPRINT_SECRET=

# Optional: daily reminder emails. Leave blank to disable.
CRON_SECRET=
RESEND_API_KEY=
REMINDER_FROM_EMAIL=
```

Notes:

- `ADMIN_USER_ID` must be the immutable Supabase Auth user id for the bootstrap administrator. Additional administrators are managed in `/admin/settings`.
- `PARENT_SESSION_SECRET` and `REQUEST_FINGERPRINT_SECRET` should be long random secrets.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code.
- The reminder variables are optional: without them the app works normally and the reminder cron reports itself as skipped.

## Supabase setup

Apply the migrations in `supabase/migrations/` in order:

1. `202606220001_initial_schema.sql` — core tables (`school_settings`, `classes`, `parent_access_attempts`) and the rate-limit function
2. `202607020001_recurring_classes.sql` — `classes.series_id` for weekly series
3. `202607020002_calendar_feed.sql` — `school_settings.calendar_feed_token`
4. `202607020003_reminders.sql` — `reminder_subscriptions` and `reminder_digests`
5. `202607020004_admins.sql` — `admins` table for additional administrators
6. `202607020005_rate_limit_cleanup.sql` — self-pruning rate-limit function

All tables are locked down: RLS enabled, all grants revoked from `anon`/`authenticated`, service-role-only access.

The initial migration seeds the singleton `school_settings` row with `Class Calendar School` and `UTC`; update these in `/admin/settings` after deployment.

## Administrator setup

1. Create the administrator/teacher user in Supabase Auth.
2. Set `ADMIN_USER_ID` to that user’s id.
3. Sign in at `/admin/login`.
4. Go to `/admin/settings` and set:
   - school display name
   - timezone
   - parent session duration
   - shared family/school access code
   - generate the calendar feed link (optional)
   - add more administrators (optional)
5. Add classes at `/admin/classes` — one-off, weekly recurring, or CSV import.

## Email reminders

Reminders send one daily digest per subscriber covering classes that start within the next 24 hours.

1. Set `CRON_SECRET`, `RESEND_API_KEY`, and `REMINDER_FROM_EMAIL` (a verified Resend sender).
2. Schedule `GET /api/reminder-cron` once per day with an `Authorization: Bearer $CRON_SECRET` header. On Vercel, `vercel.json` already declares the cron (16:00 UTC by default — adjust to your school’s evening) and Vercel sends the header automatically when `CRON_SECRET` is set.
3. Parents subscribe from the bottom of `/calendar`; every email contains an unsubscribe link.

The digest is idempotent per school-local day, so re-running the cron cannot double-send.

## CSV import format

Header row required. Columns: `title,teacher,date,start_time,end_time,zoom_url,description` (description optional). Dates are `YYYY-MM-DD`; times are 24-hour `HH:MM` in the school timezone. Nothing is imported unless every row is valid.

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

The same gate runs in CI (`.github/workflows/ci.yml`) on every push and pull request.

## Deployment

Deploy as a standard Next.js app. Configure all required environment variables in the hosting platform before first production build.

After deployment, use `/admin/settings` to rotate the parent access code whenever needed. The code is stored only as a bcrypt hash and is never rendered back to the UI. Regenerating the calendar feed link revokes previously shared feed URLs.
