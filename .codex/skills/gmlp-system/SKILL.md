---
name: gmlp-system
description: Use for work on the Globalife Medical Laboratory & Polyclinic System Next.js app, including patient self-registration, login, staff pages, queue management, public queue display, branding, Supabase-backed clinic workflows, and admin settings.
---

# GMLP System

## Use This Skill When

Use this skill when working on:
- patient self-registration at `/register`
- login at `/login`
- staff workflows under `/staff/*`
- queue management at `/staff/queue`
- the public queue monitor at `/queue-display`
- result release, soft-copy QR, and PDF delivery
- Supabase schema, auth, RLS, and data integration
- admin settings, pricing, partner companies, and staff accounts

## Project Context

- App name: Globalife Medical Laboratory & Polyclinic System
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS
- Database target: Supabase Postgres with RLS
- Deployment target: Vercel
- Style direction: clean clinic UI, readable spacing, minimal clutter
- Patient-facing pages must remain mobile responsive
- Public-facing pages should prioritize clarity and fast readability

## Current Important Routes

- `/login`: staff login using Supabase auth
- `/register`: patient self-registration
- `/queue-display`: second-monitor public queue display
- `/report/[queueId]`: public soft-copy report page for released results
- `/scan/queue/[id]`: QR scan resolver for active visit/queue context
- `/staff/patient-registration`: staff-side registration and verification
- `/staff/queue`: staff queue management
- `/staff/lab-orders`: lab order management and machine upload
- `/staff/result-encoding`: doctor consultation / referral workflow
- `/staff/cashier`: cashier and billing
- `/staff/patient-records`: patient history and management
- `/staff/result-release`: result validation, release, PDF, and review flow
- `/staff/settings`: admin-only settings page

## Roles

Frontend roles currently mapped in the app:
- `admin`
- `nurse`
- `blood_test`
- `drug_test`
- `doctor`
- `xray`
- `cashier`

Frontend station-role mappings use:
- `admin`
- `nurse`
- `blood-test`
- `drug-test`
- `doctor`
- `xray`
- `cashier`

Role behavior:
- `admin` can see all modules and the full queue board
- `nurse` handles intake, verification, queueing, and full-board operational view
- `blood-test`, `drug-test`, `doctor`, and `xray` only see their assigned queue/process screens
- `cashier` focuses on billing and patient records

## Queue Rules

- Patients self-register first through `/register`
- Staff verifies the patient before adding them to the queue
- Queue numbers are assigned by staff, not directly by the self-registration page
- Public display should prefer queue numbers only and avoid showing patient names
- `GENERAL` is the intake queue
- `PRIORITY LANE` is handled before regular `GENERAL` entries when departments accept the next patient
- Queue lanes in the display and manager are: `GENERAL`, `PRIORITY LANE`, `BLOOD TEST`, `DRUG TEST`, `DOCTOR`, `XRAY`
- `Pre-Employment` patients must complete `BLOOD TEST`, `DRUG TEST`, `DOCTOR`, and `XRAY`, but they may enter any unfinished station in any available order
- `Check-Up` patients go to `DOCTOR` first; `BLOOD TEST`, `DRUG TEST`, and `XRAY` are optional referrals added after doctor review
- `Lab` goes directly to the selected lab lane
- `/staff/queue` is the control page for intake, department acceptance, and step completion
- Queue is now DB-backed, not localStorage-driven

## Registration Notes

- `/register` contains the patient self-registration form
- The form includes first, middle, and last name; company; birthdate; gender; contact number; email address; street address; city; province; service needed; lab service when needed; and notes
- `Service Needed` is: `Pre-Employment`, `Check-Up`, `Lab`
- If `Lab` is selected, `Lab Service` is: `Blood Test`, `Drug Test`, `Xray`
- After successful submission, `/register` shows a thank-you screen with `Registration Complete`
- Do not re-add the removed `Continue to Login` action block unless the user asks
- `/register` submits to Supabase `self_registrations` through the anon client
- `/staff/patient-registration` now reads real pending registrations from Supabase and prints a queue slip with QR after verification

## Login Notes

- `/login` should not show the old `OR / Patient Self-Registration` block
- Keep the `Forgot Password?` link working
- `/login` uses real Supabase email/password auth
- Authenticated role comes from `public.staff_profiles`
- `staff_profiles.id` must match `auth.users.id`
- Staff layout pages are guarded and redirect unauthenticated users to `/login`

## Branding

Use:
- `Globalife Medical Laboratory & Polyclinic`
- `System`

Replace or avoid old branding such as:
- `Clinical Architect`
- `Medical Suite v1.0`

## UI Preferences

- Prefer elegant, clean layouts
- `/staff/patient-registration` uses a modal for the full verification form instead of keeping the form permanently open on the page
- `/queue-display` should stay light / white and optimized for TV / big-screen viewing
- `/queue-display` should try to fit within one screen without overflow
- Keep `/queue-display` header compact, top-aligned, and nav-like
- `/queue-display` should emphasize `Now Serving` and de-emphasize extra patient detail
- Public queue cards and lists should show queue numbers only unless the user explicitly wants more detail
- On `/queue-display`, `GENERAL` and `PRIORITY LANE` are grouped in one shared container
- On `/queue-display`, the four lab sections are grouped in one shared horizontal area using dividers instead of four separate outer cards
- The right-side lab queues currently show up to 9 visible numbers each
- The lab queue count badges should read like `6 queues`
- `Now Serving` currently supports 4 visible active queues and includes `PLEASE PROCEED TO: [LAB]`
- The report header accent is blue, not green
- Use Philippine peso formatting (`?`) for billing/admin pricing and dashboard revenue
- Keep patient-facing forms readable on mobile first
- Prefer targeted edits over full rewrites

## Database Notes

- Primary schema: `supabase/migrations/20260330_001_init_gmlp_schema.sql`
- Report review-note migration: `supabase/migrations/20260401_001_report_review_notes.sql`
- Admin settings migration: `supabase/migrations/20260401_002_admin_settings.sql`
- Staff profile seed template: `supabase/seeds/20260331_staff_profiles_template.sql`
- Environment variables expected by the app:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
- Optional email env vars:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
- Supabase helpers:
  - browser client: `lib/supabase/client.ts`
  - admin client: `lib/supabase/admin.ts`
  - admin auth guard: `lib/supabase/admin-auth.ts`
  - env helpers: `lib/supabase/env.ts`

## Current DB-Backed Flows

These are DB-backed now:
- `/register` -> `self_registrations`
- `/staff/patient-registration` pending queue + verification
- live queue (`queue_entries`, `queue_steps`, `visits`, `patients`)
- `/staff/lab-orders` machine TXT upload -> `machine_imports`, `result_items`, `lab_order_items`
- `/staff/cashier` -> `invoices`, `invoice_items`, `payments`
- `/staff/patient-records` -> real Supabase-backed patient history
- `/staff/result-release` -> `reports` validate / release / review state
- public `/report/[queueId]` soft copy access based on release status

## Machine Result Notes

- Machine TXT parsing is handled in `lib/machine-result-parser.ts`
- Upload page is `/staff/lab-orders`
- Raw analyzer output goes to `machine_imports`
- Parsed analytes go to `result_items`
- Blood-lane uploads currently support explicit `Hematology / CBC` and `Urinalysis` selection
- CBC and Urinalysis are separated into distinct report sections even though they currently pass through the same `BLOOD TEST` station
- Drug-test ASTM-like parsing now supports `NEG` / `POS` and maps them into `result_items` with proper flags
- Lab order numbers now use `LAB-###`

## Result Release Notes

- `/staff/result-release` now reads real report data from Supabase
- Release queue stays visible while the selected report preview stays open on the right
- `Audit Log` is a real audit timeline sourced from DB activity
- `Flag for Review` is a real DB action that blocks release and stores review remarks
- Review remarks are stored in `reports.review_notes`
- `Validate Report` and `Release Result` are real DB status transitions
- `Release Result` generates a server-side PDF and uploads it to Supabase Storage bucket `reports`
- PDF path is stored in `reports.pdf_storage_path`
- Public soft-copy QR opens `/report/[queueId]`
- Public soft copy is blocked unless the report is actually released
- Public soft-copy page can also download a signed URL for the stored released PDF
- Email sending is implemented but can be left unused until a domain/from-address exists

## Admin Settings Notes

- Admin settings page: `/staff/settings`
- Admin settings currently manage:
  - `service_catalog` pricing
  - `partner_companies`
  - staff/user account creation through Supabase Auth + `staff_profiles`
- Services and partner companies support edit buttons that open popup modals
- Cashier now reads service pricing from `service_catalog` through `/api/staff/service-catalog`
- Partner companies are stored, but patient registration still uses free-text company input for now

## Deployment Notes

- App is prepared for Vercel
- QR generation should use `NEXT_PUBLIC_APP_URL`
- Printed queue slip QR should point to `/scan/queue/[id]`
- Printed lab-result QR should point to `/report/[queueId]`
- `pnpm` is the package manager in current project setup

## Working Rules

- Preserve working flows unless the user explicitly asks for redesign
- Use existing Tailwind and component patterns where possible
- After TypeScript or JSX changes, validate with `npx tsc --noEmit` when feasible
- After substantial route/build changes, also validate with `npm run build`
- When touching auth or data access, extend the Supabase-backed path rather than reintroducing localStorage
- If editing hidden `.codex` or some migration files on Windows and `apply_patch` fails with sandbox refresh issues, a direct file write is acceptable as fallback
