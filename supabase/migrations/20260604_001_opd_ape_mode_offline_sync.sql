do $$
begin
  create type public.visit_context as enum ('opd', 'ape');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.ape_event_status as enum ('planned', 'active', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.sync_status as enum ('local_pending', 'synced', 'conflict', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.ape_events (
  id uuid primary key default gen_random_uuid(),
  ape_code text not null unique,
  name text not null,
  location text,
  start_date date not null,
  end_date date,
  status public.ape_event_status not null default 'planned',
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ape_events_date_check check (end_date is null or end_date >= start_date)
);

create table if not exists public.clinic_runtime_settings (
  id boolean primary key default true,
  ape_mode_enabled boolean not null default false,
  active_ape_event_id uuid references public.ape_events (id) on delete set null,
  local_device_id text,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint clinic_runtime_settings_singleton check (id)
);

insert into public.clinic_runtime_settings (id, ape_mode_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.patients
  add column if not exists first_visit_context public.visit_context not null default 'opd',
  add column if not exists first_ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.self_registrations
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.visits
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.queue_entries
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.queue_steps
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.lab_orders
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.lab_order_items
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.consultations
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.patient_test_instances
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.reports
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.invoices
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.payments
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

alter table public.audit_events
  add column if not exists visit_context public.visit_context not null default 'opd',
  add column if not exists ape_event_id uuid references public.ape_events (id) on delete set null,
  add column if not exists created_device_id text,
  add column if not exists sync_status public.sync_status not null default 'synced',
  add column if not exists synced_at timestamptz,
  add column if not exists last_modified_at timestamptz not null default timezone('utc', now());

create index if not exists visits_context_idx on public.visits (visit_context, ape_event_id, created_at desc);
create index if not exists queue_entries_context_idx on public.queue_entries (visit_context, ape_event_id, queue_date desc);
create index if not exists lab_orders_context_idx on public.lab_orders (visit_context, ape_event_id, created_at desc);
create index if not exists patient_test_instances_context_idx on public.patient_test_instances (visit_context, ape_event_id, created_at desc);
create index if not exists reports_context_idx on public.reports (visit_context, ape_event_id, created_at desc);
create index if not exists audit_events_context_idx on public.audit_events (visit_context, ape_event_id, created_at desc);

drop trigger if exists set_updated_at_ape_events on public.ape_events;
create trigger set_updated_at_ape_events
before update on public.ape_events
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_clinic_runtime_settings on public.clinic_runtime_settings;
create trigger set_updated_at_clinic_runtime_settings
before update on public.clinic_runtime_settings
for each row execute function public.set_updated_at();

alter table public.ape_events enable row level security;
alter table public.clinic_runtime_settings enable row level security;

create policy "authenticated staff read ape events"
on public.ape_events for select to authenticated
using (public.current_app_role() is not null);

create policy "admin manage ape events"
on public.ape_events for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "authenticated staff read clinic runtime"
on public.clinic_runtime_settings for select to authenticated
using (public.current_app_role() is not null);

create policy "admin manage clinic runtime"
on public.clinic_runtime_settings for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));
