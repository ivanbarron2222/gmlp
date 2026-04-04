create extension if not exists pgcrypto;

create type public.app_role as enum (
  'admin',
  'nurse',
  'blood_test',
  'drug_test',
  'doctor',
  'xray',
  'cashier',
  'pathologist'
);

create type public.gender_type as enum ('male', 'female', 'other');
create type public.service_type as enum ('pre_employment', 'check_up', 'lab');
create type public.lab_service_type as enum ('blood_test', 'drug_test', 'xray');
create type public.registration_status as enum ('pending', 'verified', 'cancelled');
create type public.visit_status as enum ('active', 'completed', 'cancelled');
create type public.queue_lane as enum (
  'general',
  'priority_lane',
  'blood_test',
  'drug_test',
  'doctor',
  'xray'
);
create type public.queue_status as enum (
  'waiting',
  'now_serving',
  'completed',
  'cancelled',
  'skipped'
);
create type public.queue_step_status as enum (
  'pending',
  'serving',
  'completed',
  'skipped',
  'cancelled'
);
create type public.consultation_status as enum (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);
create type public.order_status as enum (
  'draft',
  'ordered',
  'in_progress',
  'completed',
  'cancelled',
  'released'
);
create type public.order_source as enum (
  'system_pre_employment',
  'doctor_referral',
  'direct_lab',
  'manual'
);
create type public.specimen_status as enum (
  'pending_collection',
  'collected',
  'processing',
  'completed',
  'rejected'
);
create type public.import_status as enum (
  'uploaded',
  'parsed',
  'reviewed',
  'accepted',
  'rejected'
);
create type public.result_flag as enum ('normal', 'high', 'low', 'critical', 'abnormal', 'unknown');
create type public.invoice_status as enum ('draft', 'unpaid', 'partially_paid', 'paid', 'void');
create type public.payment_method as enum ('cash', 'gcash', 'card', 'bank_transfer', 'other');
create type public.report_status as enum ('draft', 'validated', 'released');

create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text not null,
  role public.app_role not null,
  assigned_lane public.queue_lane,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staff_profiles_lane_check check (
    assigned_lane is null
    or assigned_lane in ('blood_test', 'drug_test', 'doctor', 'xray')
  )
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  full_name text generated always as (
    btrim(first_name || ' ' || coalesce(middle_name || ' ', '') || last_name)
  ) stored,
  company text,
  birth_date date not null,
  gender public.gender_type not null,
  contact_number text,
  email_address text,
  street_address text,
  city text,
  province text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.self_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_code text not null unique,
  patient_id uuid references public.patients (id) on delete set null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  company text,
  birth_date date not null,
  gender public.gender_type not null,
  contact_number text,
  email_address text,
  street_address text,
  city text,
  province text,
  service_needed public.service_type not null,
  requested_lab_service public.lab_service_type,
  notes text,
  status public.registration_status not null default 'pending',
  verified_by uuid references public.staff_profiles (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint self_registrations_lab_service_check check (
    (service_needed = 'lab' and requested_lab_service is not null)
    or (service_needed <> 'lab' and requested_lab_service is null)
  )
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  visit_code text not null unique,
  patient_id uuid not null references public.patients (id) on delete restrict,
  registration_id uuid references public.self_registrations (id) on delete set null,
  service_type public.service_type not null,
  requested_lab_service public.lab_service_type,
  priority_lane boolean not null default false,
  status public.visit_status not null default 'active',
  current_lane public.queue_lane not null default 'general',
  notes text,
  checked_in_by uuid references public.staff_profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint visits_lab_service_check check (
    (service_type = 'lab' and requested_lab_service is not null)
    or (service_type <> 'lab' and requested_lab_service is null)
  )
);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_number text not null,
  queue_date date not null default (timezone('Asia/Manila', now())::date),
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  service_type public.service_type not null,
  requested_lab_service public.lab_service_type,
  current_lane public.queue_lane not null default 'general',
  queue_status public.queue_status not null default 'waiting',
  counter_name text,
  priority_lane boolean not null default false,
  now_serving_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint queue_entries_queue_number_queue_date_key unique (queue_number, queue_date)
);

create table public.queue_steps (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  queue_entry_id uuid not null references public.queue_entries (id) on delete cascade,
  lane public.queue_lane not null,
  sort_order smallint not null default 1,
  is_required boolean not null default true,
  status public.queue_step_status not null default 'pending',
  accepted_by uuid references public.staff_profiles (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (queue_entry_id, lane)
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  queue_entry_id uuid references public.queue_entries (id) on delete set null,
  doctor_id uuid references public.staff_profiles (id) on delete set null,
  status public.consultation_status not null default 'pending',
  chief_complaint text,
  assessment text,
  plan text,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  visit_id uuid not null references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  consultation_id uuid references public.consultations (id) on delete set null,
  source public.order_source not null,
  status public.order_status not null default 'ordered',
  created_by uuid references public.staff_profiles (id) on delete set null,
  validated_by uuid references public.staff_profiles (id) on delete set null,
  released_by uuid references public.staff_profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  validated_at timestamptz,
  released_at timestamptz
);

create table public.lab_order_items (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references public.lab_orders (id) on delete cascade,
  service_lane public.queue_lane not null,
  requested_lab_service public.lab_service_type not null,
  test_code text not null,
  test_name text not null,
  sample_id text unique,
  specimen_status public.specimen_status not null default 'pending_collection',
  status public.order_status not null default 'ordered',
  is_machine_integrated boolean not null default false,
  collected_by uuid references public.staff_profiles (id) on delete set null,
  collected_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lab_order_items_lane_check check (
    service_lane in ('blood_test', 'drug_test', 'xray')
  ),
  unique (lab_order_id, test_code)
);

create table public.machine_imports (
  id uuid primary key default gen_random_uuid(),
  lab_order_item_id uuid not null references public.lab_order_items (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  lane public.queue_lane not null,
  import_status public.import_status not null default 'uploaded',
  source_filename text not null,
  source_order_id text,
  source_sample_id text,
  raw_content text not null,
  parsed_payload jsonb not null default '{}'::jsonb,
  imported_by uuid references public.staff_profiles (id) on delete set null,
  reviewed_by uuid references public.staff_profiles (id) on delete set null,
  accepted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint machine_imports_lane_check check (
    lane in ('blood_test', 'drug_test', 'xray')
  )
);

create table public.result_items (
  id uuid primary key default gen_random_uuid(),
  machine_import_id uuid references public.machine_imports (id) on delete cascade,
  lab_order_item_id uuid not null references public.lab_order_items (id) on delete cascade,
  analyte_code text,
  analyte_name text not null,
  result_value text not null,
  unit text,
  reference_range text,
  result_flag public.result_flag not null default 'unknown',
  display_order integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  status public.invoice_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  source_type text not null,
  source_id uuid,
  description text not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method public.payment_method not null,
  reference_number text,
  official_receipt_number text,
  received_by uuid references public.staff_profiles (id) on delete set null,
  paid_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null unique references public.lab_orders (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  status public.report_status not null default 'draft',
  pdf_storage_path text,
  email_sent_at timestamptz,
  validated_by uuid references public.staff_profiles (id) on delete set null,
  released_by uuid references public.staff_profiles (id) on delete set null,
  validated_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index patients_full_name_idx on public.patients using gin (to_tsvector('simple', full_name));
create index patients_birth_date_idx on public.patients (birth_date);
create index self_registrations_status_idx on public.self_registrations (status, created_at desc);
create index visits_patient_status_idx on public.visits (patient_id, status, created_at desc);
create index queue_entries_lane_status_idx on public.queue_entries (current_lane, queue_status, priority_lane, created_at);
create index queue_steps_lane_status_idx on public.queue_steps (lane, status, sort_order, created_at);
create index consultations_doctor_status_idx on public.consultations (doctor_id, status);
create index lab_orders_visit_status_idx on public.lab_orders (visit_id, status, created_at desc);
create index lab_order_items_lane_status_idx on public.lab_order_items (service_lane, status, specimen_status);
create index machine_imports_item_status_idx on public.machine_imports (lab_order_item_id, import_status, created_at desc);
create index result_items_lab_order_item_idx on public.result_items (lab_order_item_id, display_order);
create index invoices_status_idx on public.invoices (status, created_at desc);
create index payments_invoice_idx on public.payments (invoice_id, paid_at desc);
create index reports_status_idx on public.reports (status, released_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_updated_at_staff_profiles
before update on public.staff_profiles
for each row execute function public.set_updated_at();

create trigger set_updated_at_patients
before update on public.patients
for each row execute function public.set_updated_at();

create trigger set_updated_at_self_registrations
before update on public.self_registrations
for each row execute function public.set_updated_at();

create trigger set_updated_at_visits
before update on public.visits
for each row execute function public.set_updated_at();

create trigger set_updated_at_queue_entries
before update on public.queue_entries
for each row execute function public.set_updated_at();

create trigger set_updated_at_queue_steps
before update on public.queue_steps
for each row execute function public.set_updated_at();

create trigger set_updated_at_consultations
before update on public.consultations
for each row execute function public.set_updated_at();

create trigger set_updated_at_lab_orders
before update on public.lab_orders
for each row execute function public.set_updated_at();

create trigger set_updated_at_lab_order_items
before update on public.lab_order_items
for each row execute function public.set_updated_at();

create trigger set_updated_at_machine_imports
before update on public.machine_imports
for each row execute function public.set_updated_at();

create trigger set_updated_at_result_items
before update on public.result_items
for each row execute function public.set_updated_at();

create trigger set_updated_at_invoices
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger set_updated_at_reports
before update on public.reports
for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
as $$
  select role
  from public.staff_profiles
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_staff_lane()
returns public.queue_lane
language sql
stable
as $$
  select assigned_lane
  from public.staff_profiles
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

create or replace function public.can_access_queue_lane(target_lane public.queue_lane)
returns boolean
language sql
stable
as $$
  select case
    when public.has_role(array['admin', 'nurse']::public.app_role[]) then true
    when public.current_app_role() = 'blood_test' then target_lane = 'blood_test'
    when public.current_app_role() = 'drug_test' then target_lane = 'drug_test'
    when public.current_app_role() = 'doctor' then target_lane = 'doctor'
    when public.current_app_role() = 'xray' then target_lane = 'xray'
    when public.current_app_role() = 'cashier' then false
    when public.current_app_role() = 'pathologist' then target_lane in ('blood_test', 'drug_test', 'xray')
    else false
  end
$$;

alter table public.staff_profiles enable row level security;
alter table public.patients enable row level security;
alter table public.self_registrations enable row level security;
alter table public.visits enable row level security;
alter table public.queue_entries enable row level security;
alter table public.queue_steps enable row level security;
alter table public.consultations enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_order_items enable row level security;
alter table public.machine_imports enable row level security;
alter table public.result_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.reports enable row level security;

create policy "staff can read own profile"
on public.staff_profiles
for select
to authenticated
using (id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

create policy "admins manage staff profiles"
on public.staff_profiles
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read patients"
on public.patients
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'blood_test', 'drug_test', 'doctor', 'xray', 'cashier', 'pathologist']::public.app_role[]));

create policy "nurse and admin manage patients"
on public.patients
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "nurse and admin update patients"
on public.patients
for update
to authenticated
using (public.has_role(array['admin', 'nurse']::public.app_role[]))
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "public can submit self registrations"
on public.self_registrations
for insert
to anon, authenticated
with check (status = 'pending');

create policy "staff can read self registrations"
on public.self_registrations
for select
to authenticated
using (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "nurse verifies self registrations"
on public.self_registrations
for update
to authenticated
using (public.has_role(array['admin', 'nurse']::public.app_role[]))
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "staff can read visits"
on public.visits
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'cashier']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
  or exists (
    select 1
    from public.lab_orders lo
    join public.lab_order_items loi on loi.lab_order_id = lo.id
    where lo.visit_id = visits.id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "nurse creates visits"
on public.visits
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "staff update visits by workflow"
on public.visits
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
)
with check (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
);

create policy "staff can read queue entries"
on public.queue_entries
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'cashier']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
);

create policy "nurse manages queue entries"
on public.queue_entries
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "staff update queue entries for assigned lane"
on public.queue_entries
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
)
with check (
  public.has_role(array['admin', 'nurse']::public.app_role[])
  or public.can_access_queue_lane(current_lane)
);

create policy "staff can read queue steps"
on public.queue_steps
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse']::public.app_role[])
  or public.can_access_queue_lane(lane)
);

create policy "nurse manages queue steps"
on public.queue_steps
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));

create policy "staff update queue steps for assigned lane"
on public.queue_steps
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse']::public.app_role[])
  or public.can_access_queue_lane(lane)
)
with check (
  public.has_role(array['admin', 'nurse']::public.app_role[])
  or public.can_access_queue_lane(lane)
);

create policy "doctor and nurse can read consultations"
on public.consultations
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "doctor and nurse manage consultations"
on public.consultations
for all
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]))
with check (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "staff can read lab orders"
on public.lab_orders
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.lab_order_id = lab_orders.id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "nurse and doctor create lab orders"
on public.lab_orders
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "staff update lab orders"
on public.lab_orders
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.lab_order_id = lab_orders.id
      and public.can_access_queue_lane(loi.service_lane)
  )
)
with check (
  public.has_role(array['admin', 'nurse', 'doctor', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.lab_order_id = lab_orders.id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "staff can read lab order items"
on public.lab_order_items
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(service_lane)
);

create policy "nurse and doctor create lab order items"
on public.lab_order_items
for insert
to authenticated
with check (public.has_role(array['admin', 'nurse', 'doctor']::public.app_role[]));

create policy "assigned lane updates lab order items"
on public.lab_order_items
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(service_lane)
)
with check (
  public.has_role(array['admin', 'nurse', 'doctor', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(service_lane)
);

create policy "staff can read machine imports"
on public.machine_imports
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(lane)
);

create policy "assigned lane inserts machine imports"
on public.machine_imports
for insert
to authenticated
with check (
  public.has_role(array['admin', 'nurse', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(lane)
);

create policy "assigned lane updates machine imports"
on public.machine_imports
for update
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(lane)
)
with check (
  public.has_role(array['admin', 'nurse', 'pathologist']::public.app_role[])
  or public.can_access_queue_lane(lane)
);

create policy "staff can read result items"
on public.result_items
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.id = result_items.lab_order_item_id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "assigned lane manages result items"
on public.result_items
for all
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.id = result_items.lab_order_item_id
      and public.can_access_queue_lane(loi.service_lane)
  )
)
with check (
  public.has_role(array['admin', 'nurse', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.id = result_items.lab_order_item_id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "cashier and admin read invoices"
on public.invoices
for select
to authenticated
using (public.has_role(array['admin', 'cashier', 'nurse']::public.app_role[]));

create policy "cashier and admin manage invoices"
on public.invoices
for all
to authenticated
using (public.has_role(array['admin', 'cashier']::public.app_role[]))
with check (public.has_role(array['admin', 'cashier']::public.app_role[]));

create policy "cashier and admin read invoice items"
on public.invoice_items
for select
to authenticated
using (public.has_role(array['admin', 'cashier', 'nurse']::public.app_role[]));

create policy "cashier and admin manage invoice items"
on public.invoice_items
for all
to authenticated
using (public.has_role(array['admin', 'cashier']::public.app_role[]))
with check (public.has_role(array['admin', 'cashier']::public.app_role[]));

create policy "cashier and admin read payments"
on public.payments
for select
to authenticated
using (public.has_role(array['admin', 'cashier']::public.app_role[]));

create policy "cashier and admin manage payments"
on public.payments
for all
to authenticated
using (public.has_role(array['admin', 'cashier']::public.app_role[]))
with check (public.has_role(array['admin', 'cashier']::public.app_role[]));

create policy "staff can read reports"
on public.reports
for select
to authenticated
using (
  public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'pathologist']::public.app_role[])
  or exists (
    select 1
    from public.lab_order_items loi
    where loi.lab_order_id = reports.lab_order_id
      and public.can_access_queue_lane(loi.service_lane)
  )
);

create policy "pathologist and admin manage reports"
on public.reports
for all
to authenticated
using (public.has_role(array['admin', 'pathologist']::public.app_role[]))
with check (public.has_role(array['admin', 'pathologist']::public.app_role[]));


