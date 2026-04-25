create table if not exists public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  availability_date date not null,
  is_available boolean not null default true,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (doctor_id, availability_date)
);

drop trigger if exists set_updated_at_doctor_availability on public.doctor_availability;
create trigger set_updated_at_doctor_availability
before update on public.doctor_availability
for each row execute function public.set_updated_at();

create index if not exists doctor_availability_date_idx
  on public.doctor_availability (availability_date, is_available);

alter table public.doctor_availability enable row level security;

drop policy if exists "admin and nurse read doctor availability" on public.doctor_availability;
create policy "admin and nurse read doctor availability"
on public.doctor_availability
for select
using (public.has_role(array['admin', 'nurse']::public.app_role[]));

drop policy if exists "admin and nurse manage doctor availability" on public.doctor_availability;
create policy "admin and nurse manage doctor availability"
on public.doctor_availability
for all
using (public.has_role(array['admin', 'nurse']::public.app_role[]))
with check (public.has_role(array['admin', 'nurse']::public.app_role[]));
