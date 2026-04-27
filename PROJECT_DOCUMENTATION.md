# Globalife Medical Laboratory & Polyclinic System

## Project Documentation

**Document version:** April 26, 2026  
**Project type:** Web-based Laboratory Information System and Clinic Operations Platform  
**Primary users:** Patients, clinic staff, medical technologists, doctors, cashier, administrators

---

## 1. Project Overview

The **Globalife Medical Laboratory & Polyclinic System** is a web-based information system designed to digitize the daily operations of a medical laboratory and polyclinic. It centralizes patient registration, queue management, doctor assignment, laboratory order handling, specimen tracking, billing, result encoding, report release, and administrative monitoring into one connected platform.

The system supports both patient-facing and staff-facing workflows. Patients can register online, check their same-day visit status, monitor queue progress, and access released laboratory results. Staff can verify patient registrations, manage service queues, process billing, upload or encode laboratory results, release reports, and review operational activity through role-based modules.

The current implementation is built with **Next.js, React, TypeScript, Tailwind CSS, and Supabase**. It uses Supabase Postgres for database records, Supabase Auth for staff authentication, Supabase Storage for released report PDFs, and Vercel-compatible deployment structure.

---

## 2. Project Purpose

The project addresses common operational problems in small to medium medical laboratories and polyclinics:

- Manual patient registration and paper-based intake forms
- Slow verification and queue assignment at the front desk
- Unclear patient movement between laboratory, doctor, imaging, and cashier stations
- Difficulty tracking missed queue calls and returning patients to the queue
- Disconnected laboratory orders, machine result imports, billing, and result release
- Limited visibility into daily revenue, patient volume, and pending validations
- Weak access control for staff roles and administrative functions
- Lack of centralized records for patient visits and released reports

The system aims to improve speed, accuracy, accountability, patient convenience, and administrative control by providing a unified digital workflow.

---

## 3. General Objectives

The general objective of the project is to develop a database-backed web system that supports the operational workflow of Globalife Medical Laboratory & Polyclinic from patient registration to result release.

---

## 4. Specific Objectives

The system specifically aims to:

1. Provide an online patient registration portal for self-registration before clinic verification.
2. Allow staff to verify registrations, encode walk-in patients, and create official patient visits.
3. Generate daily queue numbers based on service type and manage patient flow across service stations.
4. Support priority lane handling and multi-station workflows for pre-employment, check-up, and laboratory patients.
5. Provide a public queue display that shows queue numbers without exposing patient names.
6. Allow patients to check same-day queue status and result availability using secure verification details.
7. Support missed-call handling, patient acknowledgment, and re-queueing while preserving completed stations.
8. Manage laboratory orders, specimen status, machine result uploads, and manual result encoding.
9. Generate and release laboratory reports with PDF storage and QR-linked public access.
10. Support billing, invoice creation, payment recording, and receipt generation.
11. Maintain searchable patient records and visit history.
12. Provide dashboard analytics for patient flow, revenue, queue activity, and pending reports.
13. Enable administrators to manage services, partner companies, staff accounts, doctor availability, and module permissions.
14. Record important system activity for accountability and audit support.

---

## 5. Scope of the System

The current project scope covers the following major areas:

- Public patient portal
- Staff authentication and role-based access
- Patient registration and verification
- Daily queue management
- Service station workflows
- Doctor assignment and availability
- Laboratory order processing
- Specimen tracking
- Machine result import and parsing
- X-ray report encoding
- Cashier and billing workflow
- Result validation and release
- Public report viewing and protected download
- Patient record management
- Dashboard analytics
- Admin settings and configuration
- Activity log and operational traceability

The system is designed for one clinic branch workflow, but the database-backed architecture can be extended for additional branches or departments in the future.

---

## 6. Target Users

### 6.1 Public Users

- Patients registering before visiting the clinic
- Patients checking queue progress and result status
- Patients viewing released reports through QR or public links

### 6.2 Internal Users

- `admin` - full administrative control, dashboard, settings, and oversight
- `nurse` - patient registration, verification, queue handling, and patient records
- `cashier` - billing, invoices, payments, and cashier-related queue workflows
- `doctor` - consultation and referral workflow
- `blood_test` - blood test station workflow and result handling
- `drug_test` - drug test station workflow and result handling
- `xray` - X-ray station workflow and report encoding
- `ecg` - ECG station workflow
- `encoder` - report encoding, validation, and release support
- `pathologist` - result validation and report release control

Staff access is controlled through Supabase authentication, staff profile status, role assignment, allowed modules, and action permissions.

---

## 7. Main System Features

### 7.1 Public Patient Portal

The root page serves as the patient portal. It provides access to:

- Patient registration
- Same-day visit checking
- Queue and result status lookup
- Staff sign-in link

The patient portal reduces front-desk congestion by allowing patients to submit their details before staff verification.

### 7.2 Patient Self-Registration

Route: `/register`

Patients can submit personal and visit information, including:

- Full name
- Birth date
- Gender
- Contact number
- Email address
- Address details
- Partner company, when applicable
- Service needed
- Requested laboratory service
- Notes

After registration, the system generates a registration reference and QR-based queue/visit access support. Submitted registrations are stored in `self_registrations` and remain pending until staff verification.

### 7.3 Staff Login and Staff Signup

Routes:

- `/login`
- `/staff-signup`

Staff members authenticate through Supabase Auth. New staff can request accounts through the signup page, while administrators manage activation, role assignment, allowed modules, and action permissions.

Inactive staff accounts are blocked from staff modules until approved.

### 7.4 Patient Verification and Official Visit Creation

Route: `/staff/patient-registration`

The patient registration module allows staff to:

- Review pending online registrations
- Encode walk-in registrations
- Match returning patients based on name, birth date, contact number, or email
- Create or update patient records
- Assign service type and laboratory services
- Assign doctors for check-up patients
- Generate the official visit and queue entry
- Print or display the queue slip with QR code

This module converts a pending registration into an official clinic visit.

### 7.5 Doctor Directory and Daily Availability

Routes:

- `/staff/doctors`
- `/api/staff/doctors`
- `/api/staff/doctor-availability`

The system includes a doctor directory and daily availability management. Staff can mark doctors as available or unavailable for the day. During check-up registration, the system can suggest a doctor based on:

- Available doctors
- Current active workload
- Previous patient-doctor relationship when a matching patient record exists

This supports more balanced doctor assignment during patient intake.

### 7.6 Queue Management

Routes:

- `/staff/queue`
- `/queue-display`
- `/api/staff/queue`
- `/api/staff/queue/action`
- `/api/staff/queue/[id]`

The queue module is database-backed through `queue_entries` and `queue_steps`. It supports:

- Daily queue numbering
- Service-prefixed queue numbers
- General and priority intake
- Multi-station routing
- Station-specific `Call Next`
- Patient acknowledgment
- Missed-call marking
- Re-queueing with previous queue number tracking
- Completed station preservation after re-queue
- Role-specific station views
- Doctor referral additions

Queue number prefixes:

- `P-###` for Pre-Employment
- `C-###` for Check-Up
- `L-###` for Laboratory

Supported queue/service lanes:

- General Intake
- Priority Lane
- Blood Test
- Drug Test
- Doctor
- X-ray
- ECG

### 7.7 Queue Notification and Missed-Call Handling

The queue includes notification tracking fields such as:

- `notification_ping_count`
- `last_ping_at`
- `response_at`
- `missed_at`
- `requeue_required_at`
- `previous_queue_number`
- `last_requeued_at`
- `requeue_count`

When a patient is called, the system can track repeated call pings. If the patient does not respond after repeated calls, the visit can be marked as missed or requiring re-queue. The patient or staff may re-queue the visit, and the system issues a new queue number while retaining completed stations.

### 7.8 Public Queue Display

Route: `/queue-display`

The public queue display is designed for clinic monitors or TVs. It shows:

- Current queue numbers
- Now-serving queues
- General and priority lanes
- Laboratory and doctor station queues

The display protects patient privacy by showing queue numbers instead of patient names.

### 7.9 Same-Day Visit Check and Result Status

Route: `/visit-check`

Patients can check their same-day visit using their registration ID and birth date. The page supports:

- Registration status lookup
- Queue number display
- Queue slip display
- QR code to active visit/profile
- Current lane and counter
- Pending and completed stations
- Live polling updates
- Patient acknowledgment through "I'm Here"
- Re-queue action when eligible
- Result availability summary
- Link to view released results
- Password-protected ZIP result download

This module gives patients a self-service way to monitor their clinic visit without asking staff repeatedly.

### 7.10 Laboratory Orders and Machine Result Upload

Route: `/staff/lab-orders`

The laboratory order module supports:

- Viewing assigned lab orders
- Station mode from queue workflow
- Blood test, drug test, X-ray, and ECG-related service handling
- Machine TXT upload
- Analyzer text parsing
- Structured result item storage
- Raw machine data storage
- X-ray report form saving
- Lab order item completion

Supported parsing includes CBC, urinalysis, and drug-test style positive/negative result handling through the machine result parser.

### 7.11 Specimen Tracking

Route: `/staff/specimen-tracking`

The specimen tracking module monitors laboratory order item progress. It supports specimen-related statuses such as:

- Pending collection
- Collected
- Processing
- Completed
- Rejected

This improves visibility into laboratory processing before validation and release.

### 7.12 Result Encoding and Consultation Workflow

Route: `/staff/result-encoding`

The result encoding page supports doctor and consultation-related workflows. It is used when queue steps route a patient into doctor processing, especially for check-up patients and doctor referral handling.

### 7.13 Cashier and Billing

Route: `/staff/cashier`

The cashier module supports:

- Pending billing list
- Invoice workspace
- Suggested service line items
- Subtotal, discount, total, and balance calculation
- Payment processing
- Invoice number generation
- Official receipt number generation
- Payment method recording
- Printable invoice or receipt output

Billing data is stored in:

- `invoices`
- `invoice_items`
- `payments`

### 7.14 Patient Records

Route: `/staff/patient-records`

The patient records module provides a searchable patient and visit history workspace. It supports:

- Patient demographic review
- Visit history
- Queue and billing context
- Released report links
- QR code generation for visit links
- Patient records PDF export

This module acts as the clinic's consolidated record lookup.

### 7.15 Result Validation and Release

Routes:

- `/staff/result-release`
- `/api/staff/result-release`
- `/api/staff/result-release-list`
- `/api/staff/result-release/email`

The result release module supports:

- Pending result list
- Report preview
- Validation workflow
- Review flagging
- Review notes
- PDF generation
- Supabase Storage upload
- Release status update
- Public access enablement after release
- Optional email notification through Resend configuration

Reports are not publicly available until their status is `released`.

### 7.16 Public Report Access and Protected Download

Routes:

- `/report/[queueId]`
- `/api/public/report-download`
- `/api/staff/report-download`

Released reports can be viewed through public report pages. Downloads are protected through a ZIP password flow. The expected password pattern is based on the patient last name plus the last four digits of the patient ID.

This provides soft-copy access while adding an additional verification layer for downloaded files.

### 7.17 Dashboard and Analytics

Route: `/dashboard`

The dashboard is database-backed and provides:

- Daily patient metrics
- Queue activity
- Payments and revenue today
- Released report counts
- Pending validations
- Patient flow chart
- Service mix chart
- Revenue trend chart
- Recent patient activity

This helps administrators and management monitor daily clinic operations.

### 7.18 Admin Settings

Route: `/staff/settings`

The settings module manages:

- Service catalog
- Service pricing
- Service lanes
- Partner companies
- Partner company package amounts
- Staff accounts
- Staff roles
- Staff activation status
- Allowed staff modules
- Action permissions
- Doctor records, where applicable

This allows clinic administrators to update operational configuration without changing source code.

### 7.19 Activity Log

Route: `/staff/activity-log`

The activity log consolidates important operational events, including:

- Queue creation and movement
- Registration verification
- Machine result uploads
- Invoice creation
- Payment recording
- Report validation
- Report release
- Report email sending
- Service catalog changes
- Partner company changes
- Staff account changes

This supports accountability, traceability, and administrative review.

---

## 8. End-to-End Workflow

The normal clinic workflow is:

1. Patient opens the portal and registers through `/register`.
2. Staff reviews the pending registration in `/staff/patient-registration`.
3. Staff verifies patient details or encodes a walk-in patient.
4. The system creates or updates the patient record.
5. The system creates a visit, queue entry, and required queue steps.
6. The patient receives a queue number and QR-linked queue slip.
7. Queue staff or station staff call the next patient.
8. Patient can acknowledge the call through `/visit-check`.
9. If the patient misses repeated calls, the patient or staff can re-queue the visit.
10. The patient completes required stations such as blood test, drug test, doctor, X-ray, or ECG.
11. Laboratory staff upload machine results or encode reports.
12. Cashier prepares invoice and records payment.
13. Pathologist or authorized staff validates and releases the report.
14. Released PDF report is stored and becomes available through public report access.
15. Patient views or downloads the released report.
16. Administrators monitor activity through dashboard, settings, records, and activity logs.

---

## 9. Service Flow Rules

### 9.1 Pre-Employment

Pre-employment patients follow a multi-station workflow. The queue path includes:

- Blood Test
- Drug Test
- Doctor
- X-ray
- ECG

The system allows eligible pre-employment patients to move through available service stations while tracking pending and completed steps.

### 9.2 Check-Up

Check-up patients are routed to the doctor first. The doctor or staff may add referrals to laboratory or imaging services when needed.

Possible referrals include:

- Blood Test
- Drug Test
- X-ray
- ECG

### 9.3 Laboratory-Only

Laboratory-only patients are routed to the requested laboratory service lane.

### 9.4 Priority Lane

Priority patients are shown separately in the staff queue and are prioritized in intake handling.

---

## 10. System Modules and Routes

| Module | Route | Purpose |
| --- | --- | --- |
| Patient Portal | `/` | Public landing portal for registration and visit checking |
| Patient Registration | `/register` | Online patient self-registration |
| Visit Check | `/visit-check` | Same-day queue, visit, and result status lookup |
| Public Queue Display | `/queue-display` | Clinic monitor display for queue numbers |
| Public Report View | `/report/[queueId]` | Released report viewing |
| Queue Scan Resolver | `/scan/queue/[id]` | QR-based queue or visit resolver |
| Staff Login | `/login` | Staff authentication |
| Staff Signup | `/staff-signup` | Staff account request |
| Dashboard | `/dashboard` | Operational analytics |
| Patient Registration Staff Module | `/staff/patient-registration` | Verification, walk-in encoding, doctor assignment, queue creation |
| Queue Management | `/staff/queue` | Live queue control and station routing |
| Doctors | `/staff/doctors` | Daily doctor availability |
| Lab Orders | `/staff/lab-orders` | Laboratory orders, uploads, station workflow |
| Specimen Tracking | `/staff/specimen-tracking` | Specimen status monitoring |
| Result Encoding | `/staff/result-encoding` | Doctor and result encoding workflow |
| Cashier | `/staff/cashier` | Billing, invoices, and payments |
| Patient Records | `/staff/patient-records` | Patient history and visit records |
| Result Release | `/staff/result-release` | Report validation, release, PDF generation |
| Settings | `/staff/settings` | Service, company, staff, role, and permission management |
| Activity Log | `/staff/activity-log` | Operational audit timeline |

---

## 11. API Routes

### 11.1 Public API

| API Route | Purpose |
| --- | --- |
| `/api/public/register` | Submit patient self-registration |
| `/api/public/visit-check` | Check same-day visit, queue, result status, acknowledge call, or re-queue |
| `/api/public/report-download` | Prepare protected released result download |
| `/api/public/service-catalog` | Load public service catalog |
| `/api/public/partner-companies` | Load active partner companies |

### 11.2 Staff API

| API Route | Purpose |
| --- | --- |
| `/api/staff/verify-registration` | Verify registration and create patient visit/queue |
| `/api/staff/pending-registrations` | Load pending registration queue |
| `/api/staff/queue` | Fetch queue entries |
| `/api/staff/queue/action` | Perform queue actions such as call next, mark missed, re-queue, referrals |
| `/api/staff/queue/[id]` | Fetch a single queue entry and context |
| `/api/staff/lab-orders` | Load and update laboratory orders |
| `/api/staff/specimen-tracking` | Load and update specimen statuses |
| `/api/staff/xray-report` | Save or load X-ray report data |
| `/api/staff/cashier` | Manage invoices and payments |
| `/api/staff/result-release-list` | Load result release queue |
| `/api/staff/result-release` | Validate and release reports |
| `/api/staff/result-release/email` | Send released report email |
| `/api/staff/report-download` | Generate signed staff download URL for released reports |
| `/api/staff/patient-records` | Load patient and visit records |
| `/api/staff/dashboard` | Load dashboard analytics |
| `/api/staff/activity-log` | Load operational activity timeline |
| `/api/staff/service-catalog` | Load staff service catalog |
| `/api/staff/admin/settings` | Manage settings, services, companies, and staff configuration |
| `/api/staff/doctors` | Load doctor assignment options |
| `/api/staff/doctor-availability` | Manage daily doctor availability |
| `/api/staff/appointments` | Manage appointment records |
| `/api/staff/inventory` | Manage inventory-related records |
| `/api/staff/exceptions` | Manage operational exceptions |
| `/api/staff/self-register` | Staff-assisted registration support |

---

## 12. Technical Architecture

### 12.1 Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Radix UI-based components
- Lucide React icons
- Recharts for analytics charts
- QRCode generation for queue slips and record links

### 12.2 Backend and Database

- Supabase Postgres
- Supabase JavaScript client
- Route handlers under Next.js App Router
- Supabase Row Level Security policies
- Admin Supabase client for protected server operations

### 12.3 Authentication and Authorization

- Supabase Auth for staff login
- `staff_profiles` for roles, activation, assigned lanes, allowed modules, and action permissions
- Role-aware UI and API behavior
- Module visibility control through `allowed_modules`
- Action-level permission support through `action_permissions`

### 12.4 Storage and Document Generation

- Supabase Storage bucket for report PDFs
- `pdf-lib` for report and patient record PDF generation
- `qrcode` for QR codes
- Custom ZIP crypto utility for protected result downloads

### 12.5 Deployment

- Designed for Vercel deployment
- Uses environment variables for Supabase, application URL, and email sending configuration

---

## 13. Database Design Summary

The database includes the following major tables:

| Table | Purpose |
| --- | --- |
| `staff_profiles` | Staff identity, role, lane, status, modules, permissions |
| `patients` | Patient demographic records |
| `self_registrations` | Public registration submissions |
| `visits` | Official clinic visits |
| `queue_entries` | Daily queue number and current queue status |
| `queue_steps` | Required station workflow per visit |
| `consultations` | Doctor consultation records and doctor assignment |
| `doctors` | Doctor directory |
| `doctor_availability` | Daily doctor availability |
| `lab_orders` | Laboratory order headers |
| `lab_order_items` | Specific ordered tests and service lane items |
| `machine_imports` | Uploaded analyzer or encoded report raw data |
| `result_items` | Structured laboratory result values |
| `reports` | Report validation, release, and PDF storage status |
| `report_revisions` | Report revision history support |
| `invoices` | Billing invoices |
| `invoice_items` | Invoice line items |
| `payments` | Payment records |
| `service_catalog` | Services, pricing, category, and lane mapping |
| `partner_companies` | Partner company records |
| `partner_company_packages` | Company-specific service package amounts |
| `audit_events` | Structured audit event records |
| `notification_events` | Email/SMS notification tracking |
| `appointments` | Appointment scheduling support |
| `inventory_items` | Inventory item records |
| `inventory_transactions` | Inventory movement records |
| `retention_policies` | Data retention policy records |

---

## 14. Security, Privacy, and Control Features

The system includes the following safeguards:

- Supabase Auth for staff authentication
- Staff activation requirement before access
- Role-based staff profiles
- Module-level access control
- Action-level permission model
- Row Level Security policies on major database tables
- Public queue display shows queue numbers only
- Public report access is blocked until report release
- Protected result ZIP download
- Signed storage URLs for report files
- Activity log and audit event support
- Separation of public and staff API routes

These controls help protect patient data while keeping clinic workflows practical.

---

## 15. Current Implementation Status

The project currently has working implementation for:

- Public patient registration
- Staff login and account request
- Staff profile activation and module access
- Patient verification
- Doctor assignment suggestion
- Queue creation and daily queue numbering
- Multi-lane queue management
- Priority lane handling
- Queue call, missed-call, acknowledgment, and re-queue workflow
- Public queue display
- Visit status checking
- Lab order management
- Machine result upload and parsing
- X-ray report saving
- Specimen tracking
- Billing and payment workflow
- Patient records
- PDF generation
- Result validation and release
- Public released report viewing
- Protected result download
- Dashboard analytics
- Admin settings
- Activity log

---

## 16. Current Limitations and Future Enhancements

Recommended future enhancements include:

- Add automated SMS support for queue calls and report release notifications.
- Expand appointment scheduling into a complete patient booking workflow.
- Add branch or multi-location support if the clinic expands.
- Add more analyzer formats for machine result imports.
- Add laboratory reference range configuration per test.
- Add inventory threshold alerts and usage reports.
- Add advanced audit dashboards for compliance review.
- Add backup, export, and data retention automation.
- Add formal test coverage for critical API workflows.
- Add user manuals for each staff role.

---

## 17. Proposed Project Significance

The system is significant because it improves clinic operations in practical ways:

- Patients can register and check status without repeated front-desk inquiries.
- Staff can manage patient flow from a central queue board.
- Laboratory staff can reduce encoding errors through machine result imports.
- Cashier staff can compute and record payments in a structured workflow.
- Administrators can monitor operations through dashboards and activity logs.
- Reports can be released digitally with controlled public access.
- The clinic gains a centralized record system instead of relying on fragmented paper processes.

For a project proposal, this system can be presented as a digital transformation solution for laboratory and polyclinic operations.

---

## 18. Conclusion

The **Globalife Medical Laboratory & Polyclinic System** is a comprehensive web-based clinic operations platform that integrates registration, queueing, laboratory processing, billing, result release, and administrative oversight.

The current implementation already demonstrates a functional end-to-end workflow supported by a real database, authentication, role-based access, PDF generation, QR code access, patient status checking, and administrative analytics.

As a project proposal foundation, it shows clear relevance to healthcare service delivery by reducing manual work, improving patient flow, strengthening record management, and giving clinic administrators better visibility and control over daily operations.
