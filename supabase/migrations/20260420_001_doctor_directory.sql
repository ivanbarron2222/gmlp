create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_updated_at_doctors on public.doctors;
create trigger set_updated_at_doctors
before update on public.doctors
for each row execute function public.set_updated_at();

alter table public.consultations
  add column if not exists doctor_directory_id uuid references public.doctors (id) on delete set null;

create index if not exists consultations_doctor_directory_status_idx
  on public.consultations (doctor_directory_id, status);

alter table public.doctors enable row level security;

drop policy if exists "admin and nurse read doctors" on public.doctors;
create policy "admin and nurse read doctors"
on public.doctors
for select
using (public.has_role(array['admin', 'nurse', 'cashier', 'encoder']::public.app_role[]));

drop policy if exists "admin manage doctors" on public.doctors;
create policy "admin manage doctors"
on public.doctors
for all
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));
