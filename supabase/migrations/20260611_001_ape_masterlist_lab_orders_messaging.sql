do $$
begin
  create type public.ape_lab_order_status as enum ('available', 'assigned', 'void');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patient_test_input_source as enum ('manual', 'machine');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.ape_masterlist_batches (
  id uuid primary key default gen_random_uuid(),
  ape_event_id uuid not null references public.ape_events (id) on delete cascade,
  company_name text not null,
  source_filename text,
  total_patients integer not null default 0,
  generated_lab_orders integer not null default 0,
  uploaded_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (ape_event_id, company_name)
);

create table if not exists public.ape_masterlist_patients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ape_masterlist_batches (id) on delete cascade,
  ape_event_id uuid not null references public.ape_events (id) on delete cascade,
  company_name text not null,
  row_number integer not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  birth_date date,
  age text,
  gender text,
  department text,
  contact_number text,
  email_address text,
  raw_payload jsonb not null default '{}'::jsonb,
  assigned_patient_id uuid references public.patients (id) on delete set null,
  assigned_lab_order_id uuid,
  assigned_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (batch_id, row_number)
);

create table if not exists public.ape_lab_order_pool (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ape_masterlist_batches (id) on delete cascade,
  ape_event_id uuid not null references public.ape_events (id) on delete cascade,
  company_name text not null,
  lab_order_number text not null,
  sequence_number integer not null,
  status public.ape_lab_order_status not null default 'available',
  assigned_masterlist_patient_id uuid references public.ape_masterlist_patients (id) on delete set null,
  assigned_patient_id uuid references public.patients (id) on delete set null,
  assigned_visit_id uuid references public.visits (id) on delete set null,
  assigned_by uuid references public.staff_profiles (id) on delete set null,
  assigned_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (ape_event_id, company_name, lab_order_number),
  unique (batch_id, sequence_number)
);

alter table public.ape_masterlist_patients
  drop constraint if exists ape_masterlist_patients_assigned_lab_order_id_fkey;

alter table public.ape_masterlist_patients
  add constraint ape_masterlist_patients_assigned_lab_order_id_fkey
  foreign key (assigned_lab_order_id) references public.ape_lab_order_pool (id) on delete set null;

alter table public.patient_test_instances
  add column if not exists input_source public.patient_test_input_source not null default 'manual',
  add column if not exists machine_source text,
  add column if not exists machine_payload jsonb not null default '{}'::jsonb;

alter table public.lab_orders
  add column if not exists mission_company_name text;

alter table public.lab_orders
  drop constraint if exists lab_orders_order_number_key;

create unique index if not exists lab_orders_standard_order_number_unique_idx
  on public.lab_orders (order_number)
  where ape_event_id is null;

create unique index if not exists lab_orders_ape_scoped_order_number_unique_idx
  on public.lab_orders (ape_event_id, mission_company_name, order_number)
  where ape_event_id is not null;

create table if not exists public.staff_message_channels (
  id uuid primary key default gen_random_uuid(),
  channel_code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.staff_message_channels (id) on delete cascade,
  sender_id uuid references public.staff_profiles (id) on delete set null,
  body text not null,
  related_patient_id uuid references public.patients (id) on delete set null,
  related_visit_id uuid references public.visits (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.staff_message_reads (
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  channel_id uuid not null references public.staff_message_channels (id) on delete cascade,
  last_read_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (staff_id, channel_id)
);

insert into public.staff_message_channels (channel_code, name, description)
values
  ('general', 'General', 'Online-only staff communication channel.'),
  ('ape-mission', 'APE Mission', 'Online-only coordination for active medical missions.'),
  ('laboratory', 'Laboratory', 'Online-only laboratory and result coordination.')
on conflict (channel_code) do update
set name = excluded.name,
    description = excluded.description;

create index if not exists ape_masterlist_patients_search_idx
  on public.ape_masterlist_patients (ape_event_id, company_name, last_name, first_name);

create index if not exists ape_lab_order_pool_status_idx
  on public.ape_lab_order_pool (ape_event_id, company_name, status, sequence_number);

create index if not exists staff_messages_channel_created_idx
  on public.staff_messages (channel_id, created_at desc);

create index if not exists staff_message_reads_channel_idx
  on public.staff_message_reads (channel_id, staff_id);

drop trigger if exists set_updated_at_ape_masterlist_batches on public.ape_masterlist_batches;
create trigger set_updated_at_ape_masterlist_batches
before update on public.ape_masterlist_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ape_masterlist_patients on public.ape_masterlist_patients;
create trigger set_updated_at_ape_masterlist_patients
before update on public.ape_masterlist_patients
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ape_lab_order_pool on public.ape_lab_order_pool;
create trigger set_updated_at_ape_lab_order_pool
before update on public.ape_lab_order_pool
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_staff_message_channels on public.staff_message_channels;
create trigger set_updated_at_staff_message_channels
before update on public.staff_message_channels
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_staff_message_reads on public.staff_message_reads;
create trigger set_updated_at_staff_message_reads
before update on public.staff_message_reads
for each row execute function public.set_updated_at();

alter table public.ape_masterlist_batches enable row level security;
alter table public.ape_masterlist_patients enable row level security;
alter table public.ape_lab_order_pool enable row level security;
alter table public.staff_message_channels enable row level security;
alter table public.staff_messages enable row level security;
alter table public.staff_message_reads enable row level security;

drop policy if exists "staff read ape masterlist batches" on public.ape_masterlist_batches;
create policy "staff read ape masterlist batches"
on public.ape_masterlist_batches for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "admin manage ape masterlist batches" on public.ape_masterlist_batches;
create policy "admin manage ape masterlist batches"
on public.ape_masterlist_batches for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff read ape masterlist patients" on public.ape_masterlist_patients;
create policy "staff read ape masterlist patients"
on public.ape_masterlist_patients for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "staff assign ape masterlist patients" on public.ape_masterlist_patients;
create policy "staff assign ape masterlist patients"
on public.ape_masterlist_patients for update to authenticated
using (public.current_app_role() is not null)
with check (public.current_app_role() is not null);

drop policy if exists "admin insert ape masterlist patients" on public.ape_masterlist_patients;
create policy "admin insert ape masterlist patients"
on public.ape_masterlist_patients for insert to authenticated
with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff read ape lab order pool" on public.ape_lab_order_pool;
create policy "staff read ape lab order pool"
on public.ape_lab_order_pool for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "staff assign ape lab order pool" on public.ape_lab_order_pool;
create policy "staff assign ape lab order pool"
on public.ape_lab_order_pool for update to authenticated
using (public.current_app_role() is not null)
with check (public.current_app_role() is not null);

drop policy if exists "admin insert ape lab order pool" on public.ape_lab_order_pool;
create policy "admin insert ape lab order pool"
on public.ape_lab_order_pool for insert to authenticated
with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff read message channels" on public.staff_message_channels;
create policy "staff read message channels"
on public.staff_message_channels for select to authenticated
using (public.current_app_role() is not null and is_active);

drop policy if exists "staff read messages" on public.staff_messages;
create policy "staff read messages"
on public.staff_messages for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "staff send messages" on public.staff_messages;
create policy "staff send messages"
on public.staff_messages for insert to authenticated
with check (public.current_app_role() is not null);

drop policy if exists "staff read own message reads" on public.staff_message_reads;
create policy "staff read own message reads"
on public.staff_message_reads for select to authenticated
using (staff_id = auth.uid());

drop policy if exists "staff insert own message reads" on public.staff_message_reads;
create policy "staff insert own message reads"
on public.staff_message_reads for insert to authenticated
with check (staff_id = auth.uid());

drop policy if exists "staff update own message reads" on public.staff_message_reads;
create policy "staff update own message reads"
on public.staff_message_reads for update to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid());
