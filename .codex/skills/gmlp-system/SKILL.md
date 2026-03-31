---
name: gmlp-system
description: Use for work on the Globalife Medical Laboratory & Polyclinic System Next.js app, including patient self-registration, login, staff pages, queue management, public queue display, branding, and UI consistency.
---

# GMLP System

## Use This Skill When

Use this skill when working on:
- patient self-registration at `/register`
- login at `/login`
- staff workflows under `/staff/*`
- queue management at `/staff/queue`
- the public queue monitor at `/queue-display`
- branding and clinic UI consistency updates
- Supabase schema, auth, and data integration for the clinic workflows

## Project Context

- App name: Globalife Medical Laboratory & Polyclinic System
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS
- Database target: Supabase Postgres with RLS
- Style direction: clean clinic UI, readable spacing, minimal clutter
- Patient-facing pages must remain mobile responsive
- Public-facing pages should prioritize clarity and fast readability

## Current Important Routes

- `/login`: staff login
- `/register`: patient self-registration
- `/staff/patient-registration`: staff-side registration and verification
- `/staff/queue`: staff queue management
- `/queue-display`: second-monitor public queue display
- `/staff/cashier`: cashier and billing
- `/staff/lab-orders`: lab order management and machine upload
- `/staff/result-encoding`: result encoding / doctor consultation
- `/staff/result-release`: result release
- `/staff/patient-records`: patient history and management
- `/scan/queue/[id]`: QR scan resolver for active visit/queue context

## Queue Rules

- Patients self-register first through `/register`
- Staff verifies the patient before adding them to the queue
- Queue numbers are assigned by staff, not directly by the self-registration page
- Public display should prefer queue numbers only and avoid showing patient names
- Queue state is still mirrored in `localStorage` through `lib/queue-store.ts`, but the production target is the Supabase schema
- `GENERAL` is the intake queue
- `PRIORITY LANE` is handled before regular `GENERAL` entries when departments accept the next patient
- Queue lanes in the display and manager are: `GENERAL`, `PRIORITY LANE`, `BLOOD TEST`, `DRUG TEST`, `DOCTOR`, `XRAY`
- `Pre-Employment` patients must complete `BLOOD TEST`, `DRUG TEST`, `DOCTOR`, and `XRAY`, but they may enter any unfinished station in any available order
- `Check-Up` patients go to `DOCTOR` first; `BLOOD TEST`, `DRUG TEST`, and `XRAY` are optional referrals added after doctor review
- `Lab` goes directly to the selected lab lane
- `/staff/queue` is the control page for intake, department acceptance, and step completion

## Registration Notes

- `/register` contains the patient self-registration form
- The form includes first, middle, and last name; company; birthdate; gender; contact number; email address; street address; city; province; service needed; lab service when needed; and notes
- `Service Needed` is: `Pre-Employment`, `Check-Up`, `Lab`
- If `Lab` is selected, `Lab Service` is: `Blood Test`, `Drug Test`, `Xray`
- After successful submission, `/register` shows a thank-you screen with `Registration Complete`
- Do not re-add the removed `Continue to Login` action block unless the user asks
- `/register` now submits to Supabase `self_registrations` through the anon client

## Login Notes

- `/login` should not show the old `OR / Patient Self-Registration` block
- Keep the `Forgot Password?` link working
- `/login` now uses real Supabase email/password auth
- Staff role is no longer manually selected in the UI
- Authenticated role comes from `public.staff_profiles`
- `staff_profiles.id` must match `auth.users.id`
- Valid app roles currently mapped in the UI are: `nurse`, `blood_test`, `drug_test`, `doctor`, `xray`, `cashier`
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
- For `/queue-display`, prefer a light or white visual treatment unless the user asks otherwise
- `/queue-display` is designed for TV / big-screen viewing and should try to fit within one screen without overflow
- Keep `/queue-display` header compact, top-aligned, and nav-like
- `/queue-display` should emphasize `Now Serving` and de-emphasize extra patient detail
- Public queue cards and lists should show queue numbers only unless the user explicitly wants more detail
- On `/queue-display`, `GENERAL` and `PRIORITY LANE` are grouped in one shared container with two columns
- On `/queue-display`, the four lab sections are grouped in one shared horizontal area using dividers instead of four separate outer cards
- The right-side lab queues currently show up to 9 visible numbers each
- The lab queue count badges should read like `6 queues`
- `Now Serving` currently supports 4 visible active queues and includes `PLEASE PROCEED TO: [LAB]`
- Keep patient-facing forms readable on mobile first
- Use simple labels and avoid unnecessary visual noise
- Prefer targeted edits over full rewrites

## Database Notes

- The production schema lives in `supabase/migrations/20260330_001_init_gmlp_schema.sql`
- Staff profile seed template lives in `supabase/seeds/20260331_staff_profiles_template.sql`
- Environment variables expected by the app:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Supabase helpers:
  - browser client: `lib/supabase/client.ts`
  - admin client: `lib/supabase/admin.ts`
  - env helpers: `lib/supabase/env.ts`

## Current DB-Backed Flows

- `/register` writes to `self_registrations`
- `/staff/patient-registration` reads pending registrations from Supabase through `app/api/staff/pending-registrations/route.ts`
- nurse verification uses `app/api/staff/verify-registration/route.ts` and creates:
  - `patients`
  - `visits`
  - `queue_entries`
  - `queue_steps`
  - `consultations` for check-up
  - `lab_orders` and `lab_order_items` for pre-employment and direct lab
  - verified status on `self_registrations`
- `/staff/lab-orders` machine TXT upload now uses `app/api/staff/lab-import/route.ts`
- machine uploads now persist to:
  - `machine_imports`
  - `result_items`
- `lab_order_items` are marked completed after a successful machine import

## Current Compatibility Bridges

- Some screens still mirror DB results into `localStorage` so older UI flows continue working
- `lib/queue-store.ts` still drives most live queue screens
- `lib/patient-records-store.ts` still backs patient-record UI compatibility
- The app is currently in a hybrid state: first production flows use Supabase, but not every screen is fully migrated yet

## Machine Result Notes

- Machine TXT parsing is handled in `lib/machine-result-parser.ts`
- The upload page is `/staff/lab-orders`
- Raw analyzer output should go to `machine_imports`
- Parsed analytes should go to `result_items`
- PDF lab reports should ultimately be generated from stored DB records, not from transient UI state

## Working Rules

- Preserve working flows unless the user explicitly asks for redesign
- Use existing Tailwind and component patterns where possible
- After TypeScript or JSX changes, prefer validating with `npx tsc --noEmit` when feasible
- When touching auth or data access, prefer extending the Supabase-backed path rather than adding new `localStorage` state unless it is clearly a temporary bridge
