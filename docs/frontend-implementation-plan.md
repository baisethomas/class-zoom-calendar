# Front-End Implementation Plan — Class Zoom Calendar

**Audience:** an AI model (or developer) executing a front-end overhaul of this repository with no prior context. Everything you need is in this document plus the repo. Read this fully before editing anything.

**Goal:** take the existing functional-but-plain UI to a polished, cohesive, mobile-first product for two audiences — parents (calendar consumers, mostly on phones) and one-or-a-few school administrators (desktop-leaning) — **without changing any behavior, route, server action, or security boundary.**

---

## 1. What this app is

A single-school class calendar. Parents enter a shared access code and see upcoming Zoom classes; administrators manage classes and settings.

**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (imported but barely used — see §3), plain CSS custom properties, Supabase (server-side only), Vitest + Testing Library (284 tests), server actions with `useActionState` forms.

**Architecture rule that governs everything:** pages are React Server Components; client components (`"use client"`) exist only where interactivity requires them (forms, dialogs, the live-clock badge). Data flows: server page → props → client leaf. Never invert this.

### Route inventory

| Route | Audience | File | Notes |
|---|---|---|---|
| `/` | public | `src/app/page.tsx` | Landing; links to /access |
| `/access` | parent | `src/app/access/page.tsx` | Access-code gate |
| `/calendar` | parent | `src/app/calendar/page.tsx` | Agenda + month views via `?view=` & `?date=` search params; reminder signup at bottom; has `loading.tsx` and `error.tsx` |
| `/admin/login` | admin | `src/app/admin/login/page.tsx` | Email/password form |
| `/admin` | admin | `src/app/admin/(protected)/page.tsx` | Dashboard |
| `/admin/classes` | admin | `.../classes/page.tsx` | List with search, cancel/restore, duplicate, delete dialog |
| `/admin/classes/new` | admin | `.../classes/new/page.tsx` | Create form incl. weekly recurrence fields |
| `/admin/classes/[id]/edit` | admin | `.../classes/[id]/edit/page.tsx` | Edit form; series-scope radios when class is in a weekly series |
| `/admin/classes/import` | admin | `.../classes/import/page.tsx` | CSV import (file or paste) |
| `/admin/settings` | admin | `.../settings/page.tsx` | Four sections: school details, access code, calendar feed, administrators |
| `/api/*` | n/a | various | JSON/ICS/HTML endpoints — **do not touch** |

### Component inventory (front-end surface you will restyle)

Server components: `src/features/classes/agenda.tsx`, `class-card.tsx`, `month-picker.tsx`.

Client components: `src/features/classes/class-form.tsx`, `admin-class-list.tsx` (includes delete dialog with focus trap), `import-form.tsx`, `live-status.tsx` (LiveBadge + JoinAction), `src/features/parent-access/access-form.tsx`, `logout-button.tsx`, `src/features/admin/login-form.tsx`, `logout-form.tsx`, `src/features/settings/settings-forms.tsx` (3 forms), `admins-list.tsx`, `src/features/reminders/subscribe-form.tsx`.

Layouts: `src/app/layout.tsx` (skip link + `<main>`), `src/app/admin/(protected)/layout.tsx` (admin header/nav).

All styling lives in **one file**: `src/app/globals.css` (~930 lines).

---

## 2. Hard constraints — violating any of these fails the build or tests

1. **Do not add, remove, rename, or move server actions.** `npm run build` runs `scripts/verify-build-boundaries.mjs`, which pins the exact count of server actions per file (auth 2, classes 6, settings 5, reminders 1 = 14 total) and scans client bundles for privileged markers. Pure UI work never needs to change these. If you think you need a new server action, you're out of scope.
2. **Never import server modules into client components.** Files with `import "server-only"` (`queries.ts`, `session.ts`, all `*actions.ts`, `admin.ts`, etc.) must stay out of any `"use client"` file's import graph. Types may be imported with `import type`.
3. **CSS scoping contract:** `tests/classes/calendar-styles.test.ts` asserts that calendar selectors (`.class-card`, `.agenda`, `.status-pill`, `.join-action`, `.month-grid`, `.date-link`, `.empty-state`, etc. — full list in that test) appear in `globals.css` **only prefixed by `.calendar-page`**, never as bare top-level class selectors. Keep this scoping (or extend the test deliberately if you introduce a new scoping scheme — do not silently delete the test).
4. **Class names tests depend on:** `tests/classes/live-status.test.tsx` asserts the join link's `className` contains `join-action--live` when live and not otherwise. Keep the `join-action` / `join-action--live` names on that element.
5. **Accessibility structure is load-bearing.** Tests query by role and accessible name throughout (`getByRole("link", { name: "Previous month" })`, `getByRole("region", { name: "Upcoming classes" })`, `getByLabelText("Zoom URL")`, `role="dialog"` with focus trap, `role="alert"` summaries that receive focus on error, `aria-current` on month cells and view switcher). Preserve every role, label, `aria-*` attribute, and focus behavior. You may restyle freely; you may not change semantics.
6. **Visible copy is asserted in tests.** Strings like "Join on Zoom", "Join now", "Happening now", "Starts in 30 min", "No classes scheduled", "Next class", "Canceled", "Upcoming classes", "Recently past classes", form labels, and error messages are matched by tests. Do not reword text; if a redesign truly demands a copy change, update the corresponding test in the same commit and say so.
7. **URLs are asserted.** Month-cell links keep the current view (`?date=...&view=month` from month view); view switcher, Today, prev/next hrefs are tested in `tests/classes/month-picker.test.tsx`.
8. **No new runtime dependencies** without strong justification. Specifically: no component libraries (no shadcn/radix/MUI), no CSS-in-JS, no animation libraries. Tailwind v4 is already installed; icons, if needed, should be inline SVG.
9. **The gate must stay green after every phase** (§7).

---

## 3. Current styling state (what you're starting from)

- `globals.css` opens with `@import "tailwindcss";` but the codebase uses **almost no Tailwind utilities in markup** — everything is semantic classes (`.class-card`, `.admin-page`, `.field`, …) hand-written in that one file.
- Design tokens are minimal, light-only:
  ```css
  :root {
    color-scheme: light;
    --background: #f5f7fb;  --foreground: #172033;  --muted: #56627a;
    --accent: #3157d5;      --accent-hover: #2546b6;
    --surface: #ffffff;     --border: #d9dfeb;
  }
  ```
- Typeface is `Arial, Helvetica, sans-serif` (no webfont). Body background has a subtle radial gradient.
- Ad-hoc hex values are scattered through the file for pills, errors, success states (e.g. `#9d2632`, `#e5f6ea`, `#fdf0d5`) instead of tokens.
- Existing shared primitives (by convention, not componentized): `.primary-action`, `.secondary-action`, `.danger-action`, `.field` (label + input/select/textarea + `.field-error` + `.field-help`), `.form-status`, `.error-summary`, `.status-pill` (+ variants), `.confirm-dialog` + `.dialog-backdrop`, `.eyebrow`, `.intro`, `.empty-state`.
- Responsive handling exists but is thin (a few media queries around 400–700px; admin rows collapse).

**Decision made for you:** keep the semantic-class + custom-property approach; do **not** convert markup to Tailwind utility classes. Tailwind v4's `@theme` may be used to formalize tokens if convenient, but the class-name contracts in §2 must hold. This keeps the diff reviewable and the test suite intact.

---

## 4. Design direction

Aim: warm, trustworthy, school-friendly; closer to a well-made consumer product (Linear/Notion-level polish) than an enterprise dashboard. Parents are often on phones in a hurry two minutes before class — the calendar must make "what's next, and where do I click" instant.

### 4.1 Token system (Phase 1 deliverable)

Replace scattered hex values with a complete scale, all in `:root` (and `[data-theme="dark"]` if dark mode is implemented — see 4.5):

- **Color:** keep `--accent` blue family as primary. Add semantic tokens: `--success-fg/bg`, `--warning-fg/bg`, `--danger-fg/bg`, `--info-fg/bg` (map existing pill/error colors onto these), `--surface-raised`, `--surface-sunken`, `--border-strong`, `--focus-ring`.
- **Typography:** introduce a webfont via `next/font` in `src/app/layout.tsx` (recommended: Inter or a similar humanist sans for UI, `font-display: swap`, subset latin). Define `--font-sans` and a type scale (`--text-xs` … `--text-3xl`) and use it; kill the raw `clamp()` font sizes where a scale step fits.
- **Spacing/radius/shadow:** `--space-1..8`, `--radius-sm/md/lg/pill`, `--shadow-sm/md/lg`. Existing radii (0.65rem inputs, 1rem cards, 999px pills) map cleanly.
- **Motion:** `--transition-fast: 120ms ease` etc.; respect `prefers-reduced-motion` with a global override that zeroes transitions/animations.

Acceptance: no raw hex color remains in `globals.css` outside the `:root`/theme blocks; visual output is intentionally near-identical at this phase (token refactor first, redesign second).

### 4.2 Parent surfaces (Phase 2)

**`/access`** — This is the front door. Center card already exists; elevate it: school-agnostic hero treatment (calendar glyph or soft illustration in CSS/inline SVG), larger friendly heading, the code input with generous touch target (≥48px), clear error styling, and a quiet footnote linking nothing (no nav leaks pre-auth).

**`/calendar`** — the core screen. Current layout: header (school name + logout), sidebar `MonthPicker` (view switcher, month nav, Today, optional grid), content (Agenda or day view), reminder signup at bottom.

- **Mobile (< 720px):** month picker collapses to a horizontal control bar (view toggle as segmented control, month title with prev/next chevrons, Today). Agenda is the default and primary experience; day headings become sticky (`position: sticky`) as the list scrolls.
- **Desktop:** two-column grid (~280px sidebar + content), sidebar card sticky.
- **Class cards:** tighten hierarchy — time range is the anchor (larger, tabular numerals via `font-variant-numeric`), title next, teacher and description quieter. Pills row-aligned right of the time. "Join on Zoom" stays the single primary CTA; "Add to calendar" is a ghost/secondary link with a small calendar icon. The `--next` card gets an accent left border + tinted background; the live state (`join-action--live` — name is load-bearing, §2) gets the green treatment plus a subtle pulse on the badge (disabled under reduced motion).
- **Month grid:** larger cells, weekday header row quieter, today's cell outlined, selected cell filled, out-of-month cells dimmed. Cell titles (`.cell-title`) act as event chips: 2px accent bar + truncated text. Keep every existing `aria-label`/`aria-current`.
- **Empty states:** replace bare text with a small illustration/icon + heading + one-liner ("No classes this month. Check back soon or switch months.").
- **Reminder signup:** restyle as a soft accent-tinted band with inline form (field + button on one row ≥ 480px).

**`/calendar/loading.tsx` and `error.tsx`:** restyle the skeleton to match the new card geometry (keep `.calendar-skeleton` scoping) and give the error panel the standard empty-state treatment with its retry affordance intact.

### 4.3 Admin surfaces (Phase 3)

**Shell (`(protected)/layout.tsx`):** upgrade the header into a proper app bar: product mark ("Class Calendar · Admin"), nav links with active-state (`aria-current="page"` — add it; it's an allowed semantic *addition*), logout right-aligned. On mobile, nav collapses to a horizontal scroll row (no JS hamburger needed — keep it CSS-only).

**`/admin/classes`:** the workhorse.
- Search field and the Import CSV / New class buttons on one toolbar row.
- Rows become cards on mobile (already partially done) — verify the 4-actions row (Edit / Cancel / Duplicate / Delete) wraps cleanly; consider grouping Cancel/Duplicate/Delete under consistent secondary styling with Delete visually isolated (danger).
- Section headers ("Upcoming classes", "Recently past classes" — copy is tested) get counts, e.g. a quiet pill with the number of rows (additive, safe).
- Delete dialog: restyle backdrop (blur), animate in (respect reduced motion), keep the focus trap and confirm-by-title mechanics untouched.

**Forms (`class-form.tsx`, settings forms, import form, login):** unify on the `.field` primitive — consistent label weight, 48px controls, visible focus ring from `--focus-ring`, error text with icon, help text quieter. The recurrence block and series-scope fieldset get card-like inset styling (`.series-scope` exists). Import form: style the CSV textarea monospace; render row errors as a proper list with the row number as a badge.

**`/admin/settings`:** currently four stacked `<section>`s. Give each a card with header + description, and lay out two-across on ≥ 1100px (`.admin-settings` grid). The feed-URL read-only input gets a one-click "copy" affordance only if done without new deps (a tiny client wrapper with `navigator.clipboard` is acceptable — it must live in an existing client file or a new client component that imports nothing server-side).

### 4.4 Landing `/`

Currently minimal. Make it a real (still tiny) landing: school-generic hero, two CTAs — "Parent access" → `/access` (primary), "Administrator sign in" → `/admin/login` (quiet text link). No data fetching; keep it static-friendly.

### 4.5 Dark mode (optional — do last, skip if time-boxed)

If implemented: `prefers-color-scheme` media query only (no toggle, no JS, no stored preference), by re-declaring the token set under `@media (prefers-color-scheme: dark)` and setting `color-scheme: dark`. Every color must come from tokens by then, so this is ~40 lines. Verify pill/error contrast (§6).

---

## 5. Execution phases

Work in this order; run the full gate (§7) after each phase and fix regressions before proceeding.

| Phase | Scope | Files touched | Done when |
|---|---|---|---|
| 0 | Read the codebase; run the gate to confirm a green baseline | none | Gate green, you can describe the constraints in §2 from memory |
| 1 | Token system + webfont + CSS file organization | `globals.css`, `layout.tsx` | No stray hex outside theme blocks; font loads via `next/font`; gate green; UI visually ~unchanged |
| 2 | Parent surfaces: access, calendar (header/agenda/cards/month grid), loading/error, reminder band | `globals.css`, minimal markup edits in `class-card.tsx`, `agenda.tsx`, `month-picker.tsx`, `access-form.tsx`, calendar `page/loading/error` | §4.2 acceptance; all copy/roles/classes contracts intact |
| 3 | Admin surfaces: shell, class list, dialogs, all forms, import, settings | `(protected)/layout.tsx`, `admin-class-list.tsx`, form components, `globals.css` | §4.3 acceptance |
| 4 | Landing page + cross-cutting polish (focus states everywhere, reduced motion, print stylesheet for `/calendar` if cheap) | `page.tsx`, `globals.css` | §4.4 acceptance |
| 5 | Dark mode (optional), final a11y & responsive audit (§6) | `globals.css` | Audit checklist complete |

CSS organization note: if `globals.css` gets unwieldy, split with plain `@import "./styles/tokens.css";` etc. at the top of `globals.css` (CSS imports, not JS) — but `tests/classes/calendar-styles.test.ts` reads **only** `globals.css`, so calendar-scoped selectors must remain in that file, or the test must be updated to read the composed output (say so explicitly if you do this).

Markup-edit budget: prefer CSS-only changes. Where markup must change (wrapping divs, icons, count pills), keep every existing class name, role, label, and text node; add, don't replace.

## 6. Audit checklist (Phase 5 exit criteria)

- **Keyboard:** every interactive element reachable and operable; visible focus ring (≥ 3:1 contrast against surroundings) on all of them; dialog focus trap still works; skip link still appears on focus.
- **Contrast:** all text ≥ 4.5:1 (large text ≥ 3:1) in light (and dark, if built) — check pills especially.
- **Touch:** all tap targets ≥ 44×44px on mobile.
- **Responsive:** test 320px, 375px, 768px, 1024px, 1440px. No horizontal scroll at 320px anywhere, including the month grid and admin class rows.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, no animation/transition runs.
- **axe:** `axe-core` is already a devDependency; if convenient, add a jsdom axe smoke test for `Agenda`, `MonthPicker`, and `ClassForm` renders (0 violations). Additive tests only.
- **Zoom:** 200% browser zoom keeps everything usable.

## 7. Verification gate (run after every phase)

```bash
npm run typecheck
npm run lint
npm test                                   # 284 tests — all must pass
SUPABASE_SERVICE_ROLE_KEY=boundary-test-secret npm run build   # must print "verified 14 privileged server actions"
git diff --check
```

There is no dev database required for any of this; tests mock Supabase. `npm run dev` will render pages but data-backed pages need env vars — for visual checking without a database, rely on component tests or temporarily render components in isolation (do not commit scaffolding).

## 8. Out of scope — do not do these

- New features, routes, API changes, or server actions
- Auth/session/security changes of any kind
- Component libraries, CSS-in-JS, icon packages, animation libraries
- Rewriting client forms away from `useActionState`, or server components into client components
- Renaming the semantic CSS classes listed in §2
- Committing or pushing (leave changes in the working tree unless instructed otherwise)

## 9. Reporting back

At handoff back, provide: (1) per-phase summary of what changed, (2) any test that had to change and exactly why, (3) the audit checklist from §6 with pass/fail per item, (4) screenshots or a written walkthrough of `/access`, `/calendar` (both views, mobile + desktop), `/admin/classes`, and `/admin/settings`.
