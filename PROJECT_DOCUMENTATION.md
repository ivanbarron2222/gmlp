# Globalife Medical Laboratory & Polyclinic System

## Presentation Documentation

## 1. Project Overview

The **Globalife Medical Laboratory & Polyclinic System** is a web-based clinic operations platform built to digitize the end-to-end workflow of patient registration, queue management, laboratory processing, billing, result release, and administrative control.

The system replaces fragmented and manual clinic processes with a centralized platform that supports both patient-facing and staff-facing operations. It is designed for fast daily use in a medical laboratory and polyclinic environment, with real-time queue visibility, database-backed records, and role-based staff access.

## 2. Project Purpose

The system was developed to address common operational issues in clinic and laboratory environments:

- Manual patient intake and incomplete records
- Slow and unclear queue handling across multiple stations
- Disconnected billing, laboratory, and result-release processes
- Difficulty tracking patient flow and daily clinic activity
- Limited oversight of staff access, pricing, and service configuration

Its goal is to provide one integrated system that improves efficiency, accuracy, patient experience, and administrative control.

## 3. Core Objectives

- Digitize patient self-registration and staff-assisted registration
- Manage patient queues across multiple service lanes in real time
- Support different clinic service types such as `Pre-Employment`, `Check-Up`, and `Lab`
- Process billing and payment with invoice and receipt generation
- Handle laboratory result encoding, validation, and release
- Provide soft-copy report access through QR-linked public pages
- Maintain a centralized patient record and activity history
- Give administrators control over pricing, companies, staff accounts, and permissions
- Deliver live analytics through a dashboard connected to the database

## 4. Target Users

The system supports both public users and internal clinic staff.

### Public Users

- Patients who self-register through the online registration page
- Patients viewing the public queue display
- Patients accessing released laboratory reports through QR or public report links

### Internal Users

- `admin`
- `nurse`
- `cashier`
- `blood_test`
- `drug_test`
- `doctor`
- `xray`
- `ecg`
- `encoder`

Each role is given only the modules and workflows relevant to its responsibilities.

## 5. Main System Features

### 5.1 Patient Self-Registration

Patients can register through the `/register` page before proceeding to the clinic. The registration form captures:

- Full name
- Company
- Birthdate
- Gender
- Contact number
- Email address
- Street address, city, and province
- Service needed
- Requested lab service if applicable
- Notes

After submission, the patient receives a registration completion confirmation. The submitted data is stored in the database and becomes visible to staff for verification.

### 5.2 Staff Login and Access Control

Staff access the platform through `/login` using Supabase authentication. Staff accounts are stored in `staff_profiles`, and login behavior depends on account activation and assigned role.

Key controls:

- Only authenticated staff can enter protected pages
- Inactive staff accounts are blocked until approved by an administrator
- Staff members can request accounts through `/staff-signup`
- Admin users can activate, deactivate, and configure module access per user

### 5.3 Patient Verification and Registration Processing

The `/staff/patient-registration` page allows front desk or nurse staff to:

- Review pending self-registrations
- Verify patient details
- Encode manual walk-in registrations
- Assign a doctor for `Check-Up` patients
- Queue the patient after verification
- Print a queue slip

This stage serves as the official intake point before the patient enters the clinic workflow.

### 5.4 Real-Time Queue Management

The `/staff/queue` module is the central control page for patient movement across service stations. The queue system is fully database-backed and supports:

- Daily queue numbering
- Priority lane handling
- Lane-specific queue progression
- Department-based routing
- `Call Next` station workflow
- Referral additions for required downstream services

Queue lanes currently supported:

- `GENERAL`
- `PRIORITY LANE`
- `BLOOD TEST`
- `DRUG TEST`
- `DOCTOR`
- `XRAY`
- `ECG`

Queue numbering is service-prefixed:

- `P-###` for `Pre-Employment`
- `C-###` for `Check-Up`
- `L-###` for `Lab`

### 5.5 Service Flow Rules

The system follows defined service logic:

- `Pre-Employment` patients must complete `BLOOD TEST`, `DRUG TEST`, `DOCTOR`, `XRAY`, and `ECG`
- `Check-Up` patients go to `DOCTOR` first, then may receive referrals to lab or imaging services
- `Lab` patients go directly to the selected lab service lane
- `PRIORITY LANE` patients are handled ahead of regular `GENERAL` entries

This structure helps ensure that the queue reflects real clinic workflow rather than a single-line waiting list.

### 5.6 Public Queue Display

The `/queue-display` page is designed for TV or monitor viewing in the clinic. It presents:

- Current time
- General queue
- Priority lane queue
- Now serving cards
- Service lane queues for lab and consultation stations

The display is intentionally patient-safe by showing **queue numbers only**, not patient names. This improves privacy while keeping queue information clear and readable.

### 5.7 Laboratory Order Management and Machine Result Upload

The `/staff/lab-orders` module supports the laboratory workflow, including upload of analyzer text files. The system:

- Accepts machine TXT uploads
- Stores raw machine data
- Parses result values into structured result items
- Supports `Hematology / CBC`
- Supports `Urinalysis`
- Supports drug-test `NEG` and `POS` parsing

This reduces manual transcription and improves consistency in laboratory data handling.

### 5.8 Result Encoding and Consultation Support

The `/staff/result-encoding` module supports consultation and referral workflows, especially in doctor-related processing. It is part of the path used to complete medical review and route patients to required next steps.

### 5.9 Cashier and Billing Management

The `/staff/cashier` page is designed as a billing workspace with:

- Pending patient list
- Active invoice workspace
- Payment processing
- Invoice and receipt printing

Billing functions include:

- Loading pending visits from the database
- Suggesting service line items
- Computing subtotal, discount, and total
- Saving invoices and payments
- Generating invoice numbers
- Generating official receipt numbers
- Printing proof-of-payment output for clinic use

### 5.10 Patient Records Management

The `/staff/patient-records` page provides a database-backed patient history view. This allows staff to review previous visits, service context, and relevant patient information in one place.

### 5.11 Result Validation and Release

The `/staff/result-release` module manages final result preparation and release. It includes:

- Searchable release queue
- Report preview panel
- Validation workflow
- Review flagging
- Review notes storage
- Release status transitions
- PDF generation
- Supabase storage upload
- Soft-copy QR generation
- Optional email sending support

A result cannot be publicly viewed until it has been officially released.

### 5.12 Public Report Access

Released reports can be accessed through `/report/[queueId]`. This gives patients a soft-copy access page for their released results. The system also supports public PDF download through signed storage access when the report is already released.

### 5.13 Dashboard and Analytics

The `/dashboard` page is database-backed and provides management insight into current clinic operations. It includes:

- Top KPI cards
- Patient flow chart
- Service mix chart
- Revenue trend chart
- Recent patients table
- Live queue panel
- Pending validations panel

This module helps management monitor both operational and financial activity.

### 5.14 Admin Settings and Oversight

The `/staff/settings` page is the administrative control center. It currently manages:

- Service catalog pricing
- Partner companies
- Staff account creation
- Role assignment
- User activation and inactivation
- Per-user module permissions

The staff section includes filters such as:

- `All Staff`
- `Pending Activation`
- `Active Only`

This helps administrators quickly identify pending accounts and manage operational access.

### 5.15 Activity Log

The `/staff/activity-log` page acts as an oversight timeline for administrators. It records important system events such as:

- Queue creation and completion
- Machine result uploads
- Payment processing
- Report validation and release actions
- Service and company changes in admin settings

This supports accountability and traceability of clinic operations.

## 6. End-to-End Workflow

The implemented system workflow is as follows:

1. The patient registers online through `/register`.
2. Staff reviews the pending registration in `/staff/patient-registration`.
3. Staff verifies the patient and sends them into the queue.
4. The patient appears in the correct queue lane based on service type.
5. Stations call and process patients through the queue workflow.
6. Laboratory results are uploaded or encoded as needed.
7. Billing is prepared and payment is processed through the cashier module.
8. Reports are validated, reviewed if needed, and officially released.
9. Patients can view released soft-copy reports through QR or public report pages.
10. Administrators monitor operations through dashboard, settings, and activity log pages.

## 7. System Modules and Routes

| Module | Route | Purpose |
| --- | --- | --- |
| Staff Login | `/login` | Secure login for clinic staff |
| Patient Self-Registration | `/register` | Public patient registration form |
| Staff Signup | `/staff-signup` | Staff account request page |
| Queue Display | `/queue-display` | Public monitor for queue visibility |
| Queue Scan Resolver | `/scan/queue/[id]` | Resolves active visit/queue context |
| Patient Registration | `/staff/patient-registration` | Verification, intake, queueing, and queue slip printing |
| Queue Management | `/staff/queue` | Live operational queue control |
| Lab Orders | `/staff/lab-orders` | Laboratory orders and machine uploads |
| Result Encoding | `/staff/result-encoding` | Consultation and result encoding workflow |
| Cashier | `/staff/cashier` | Billing, payments, invoice, and receipt printing |
| Patient Records | `/staff/patient-records` | Patient history and management |
| Result Release | `/staff/result-release` | Validation, PDF generation, and result release |
| Public Report | `/report/[queueId]` | Released report access page |
| Admin Settings | `/staff/settings` | Pricing, companies, staff, and permissions |
| Activity Log | `/staff/activity-log` | Administrative oversight timeline |
| Dashboard | `/dashboard` | Live analytics and daily clinic metrics |

## 8. Technical Architecture

The system is implemented using the following stack:

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS
- **Backend/Data Layer:** Supabase Postgres
- **Authentication:** Supabase Auth
- **Authorization:** Role-aware frontend logic with database-backed staff profiles
- **Storage:** Supabase Storage for released PDF reports
- **Deployment Target:** Vercel
- **Package Manager:** `pnpm`

Supporting libraries include:

- `pdf-lib` for PDF generation
- `qrcode` for soft-copy QR creation
- `recharts` for analytics charts

## 9. Database-Backed Components

The system already uses real database-backed flows for major modules, including:

- `self_registrations`
- `patients`
- `visits`
- `queue_entries`
- `queue_steps`
- `lab_orders`
- `machine_imports`
- `result_items`
- `reports`
- `invoices`
- `invoice_items`
- `payments`
- `service_catalog`
- `partner_companies`
- `staff_profiles`

This allows the platform to operate as an integrated clinic information system instead of relying on mock or local-only data.

## 10. Security and Control Features

The system includes key operational safeguards:

- Staff authentication through Supabase
- Protected staff pages
- Pending activation handling for new staff accounts
- Role-aware visibility of modules and queue screens
- Public queue display without patient names
- Public report access blocked unless result status is released
- Audit-style activity logging for major system actions

These controls help balance usability with privacy, accountability, and controlled access.

## 11. Key Strengths of the System

- Centralized workflow from registration to result release
- Real-time queue visibility for both staff and patients
- Reduced manual handling through machine result upload and structured records
- Better patient privacy on public-facing displays
- Better administrative oversight through analytics and activity logs
- Configurable pricing, staffing, and module access
- Scalable structure for future clinic expansion

## 12. Current Scope and Pending Enhancements

The current implementation is already functional across major clinic operations. However, some future improvements are still identified:

- More advanced doctor assignment and load balancing
- Expanded activity log coverage
- Partner-company dropdown or autocomplete during registration
- Specimen tracking expansion if the route becomes active
- Additional report and permission refinements

## 13. Conclusion

The **Globalife Medical Laboratory & Polyclinic System** is a comprehensive clinic operations platform built to modernize patient intake, queue management, billing, laboratory processing, result release, and administrative oversight.

By integrating these workflows into one database-backed web application, the system improves operational efficiency, strengthens data organization, supports better patient service, and gives clinic administrators stronger control over daily activities.

In presentation terms, the project demonstrates a practical and scalable digital solution for real-world medical laboratory and polyclinic operations.
