create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  visit_id uuid references public.visits (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  queue_entry_id uuid references public.queue_entries (id) on delete set null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  summary text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

create index if not exists audit_events_visit_idx
  on public.audit_events (visit_id, created_at desc);

create index if not exists audit_events_patient_idx
  on public.audit_events (patient_id, created_at desc);

create table if not exists public.report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  revision_number integer not null,
  status public.report_status not null,
  action text not null,
  review_notes text,
  pdf_storage_path text,
  changed_by uuid references public.staff_profiles (id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, revision_number)
);

create index if not exists report_revisions_report_idx
  on public.report_revisions (report_id, created_at desc);

create type public.notification_channel as enum ('email', 'sms');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel public.notification_channel not null,
  status public.notification_status not null default 'pending',
  patient_id uuid references public.patients (id) on delete set null,
  visit_id uuid references public.visits (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  recipient text not null,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  provider_name text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_events_status_idx
  on public.notification_events (status, created_at desc);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  unit text not null,
  linked_lane public.queue_lane,
  reorder_threshold numeric(12,2) not null default 0,
  on_hand_quantity numeric(12,2) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  transaction_type text not null,
  quantity numeric(12,2) not null,
  resulting_quantity numeric(12,2) not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_transactions_item_idx
  on public.inventory_transactions (inventory_item_id, created_at desc);

create type public.appointment_status as enum ('scheduled', 'arrived', 'no_show', 'completed', 'cancelled');

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  visit_id uuid references public.visits (id) on delete set null,
  doctor_id uuid references public.staff_profiles (id) on delete set null,
  scheduled_for timestamptz not null,
  arrival_window_minutes integer not null default 30,
  status public.appointment_status not null default 'scheduled',
  notes text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists appointments_doctor_status_idx
  on public.appointments (doctor_id, status, scheduled_for);

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null unique,
  entity_type text not null,
  retention_days integer not null,
  archive_enabled boolean not null default true,
  protected_delete boolean not null default true,
  notes text,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.partner_company_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies (id) on delete cascade,
  package_code text not null,
  package_name text not null,
  service_codes text[] not null default '{}',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, package_code)
);

alter table public.staff_profiles
  add column if not exists action_permissions text[] not null default '{}';

alter table public.patients
  add column if not exists partner_company_id uuid references public.partner_companies (id) on delete set null;

alter table public.self_registrations
  add column if not exists partner_company_id uuid references public.partner_companies (id) on delete set null;

alter table public.lab_order_items
  add column if not exists specimen_id text unique,
  add column if not exists processing_started_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists recollection_requested boolean not null default false,
  add column if not exists recollection_requested_at timestamptz,
  add column if not exists last_scanned_at timestamptz;

alter table public.queue_entries
  add column if not exists override_reason text;

drop trigger if exists set_updated_at_inventory_items on public.inventory_items;
create trigger set_updated_at_inventory_items
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_appointments on public.appointments;
create trigger set_updated_at_appointments
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_retention_policies on public.retention_policies;
create trigger set_updated_at_retention_policies
before update on public.retention_policies
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_partner_company_packages on public.partner_company_packages;
create trigger set_updated_at_partner_company_packages
before update on public.partner_company_packages
for each row execute function public.set_updated_at();

alter table public.audit_events enable row level security;
alter table public.report_revisions enable row level security;
alter table public.notification_events enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.appointments enable row level security;
alter table public.retention_policies enable row level security;
alter table public.partner_company_packages enable row level security;

create policy "staff can read audit events"
on public.audit_events
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "staff can insert audit events"
on public.audit_events
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "staff can read report revisions"
on public.report_revisions
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "staff can insert report revisions"
on public.report_revisions
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "staff can read notifications"
on public.notification_events
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder']::public.app_role[]));

create policy "staff can insert notifications"
on public.notification_events
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'encoder']::public.app_role[]));

create policy "staff can read inventory"
on public.inventory_items
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'cashier', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "admin manages inventory"
on public.inventory_items
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read inventory transactions"
on public.inventory_transactions
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'cashier', 'blood_test', 'drug_test', 'xray', 'ecg', 'pathologist']::public.app_role[]));

create policy "admin manages inventory transactions"
on public.inventory_transactions
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read appointments"
on public.appointments
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "staff can manage appointments"
on public.appointments
for all
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]))
with check (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "admin manages retention policies"
on public.retention_policies
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read retention policies"
on public.retention_policies
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'cashier', 'doctor', 'encoder']::public.app_role[]));

create policy "staff can read partner company packages"
on public.partner_company_packages
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier']::public.app_role[]));

create policy "admin manages partner company packages"
on public.partner_company_packages
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

insert into public.retention_policies (policy_code, entity_type, retention_days, archive_enabled, protected_delete, notes)
values
  ('patient-records', 'patient_records', 3650, true, true, 'Long-term retention for permanent patient records.'),
  ('billing-records', 'billing_records', 3650, true, true, 'Protect invoice and payment history from deletion.'),
  ('audit-events', 'audit_events', 3650, true, true, 'Keep governance and exception trails for oversight.'),
  ('reports', 'reports', 3650, true, true, 'Retain released reports and revision history.')
on conflict (policy_code) do nothing;
