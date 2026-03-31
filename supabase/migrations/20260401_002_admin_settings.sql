create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  service_name text not null,
  category text not null,
  amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.partner_companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique,
  company_name text not null unique,
  contact_person text,
  contact_number text,
  email_address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists service_catalog_sort_idx
  on public.service_catalog (is_active, sort_order, service_name);

create index if not exists partner_companies_sort_idx
  on public.partner_companies (is_active, company_name);

drop trigger if exists set_updated_at_service_catalog on public.service_catalog;
create trigger set_updated_at_service_catalog
before update on public.service_catalog
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_partner_companies on public.partner_companies;
create trigger set_updated_at_partner_companies
before update on public.partner_companies
for each row execute function public.set_updated_at();

alter table public.service_catalog enable row level security;
alter table public.partner_companies enable row level security;

create policy "staff can read service catalog"
on public.service_catalog
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier', 'blood_test', 'drug_test', 'xray', 'pathologist']::public.app_role[]));

create policy "admin manages service catalog"
on public.service_catalog
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read partner companies"
on public.partner_companies
for select
to authenticated
using (public.has_role(array['admin', 'nurse', 'doctor', 'cashier']::public.app_role[]));

create policy "admin manages partner companies"
on public.partner_companies
for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

insert into public.service_catalog (service_code, service_name, category, amount, sort_order)
values
  ('svc-pre-employment', 'Pre-Employment Package', 'Packages', 850, 1),
  ('svc-checkup', 'Doctor Check-Up Consultation', 'Consultation', 500, 2),
  ('svc-blood-test', 'Blood Test Service', 'Laboratory', 250, 3),
  ('svc-drug-test', 'Drug Test Service', 'Laboratory', 350, 4),
  ('svc-xray', 'Xray Service', 'Imaging', 650, 5)
on conflict (service_code) do nothing;

insert into public.partner_companies (company_code, company_name, is_active)
values
  ('sm', 'SM', true),
  ('sti', 'STI', true)
on conflict (company_name) do nothing;
