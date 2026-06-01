create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_positions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.departments (code, name)
values
  ('administration', 'Administration'),
  ('front_desk', 'Front Desk / Cashier'),
  ('laboratory', 'Laboratory'),
  ('radiology', 'Radiology / X-ray'),
  ('clinical_exam', 'Clinical Examination'),
  ('drug_testing', 'Drug Testing')
on conflict (code) do update set name = excluded.name;

insert into public.job_positions (code, name)
values
  ('administrator', 'Administrator'),
  ('front_desk_cashier', 'Front Desk / Cashier'),
  ('medical_technologist', 'Medical Technologist'),
  ('nurse', 'Nurse'),
  ('doctor', 'Doctor'),
  ('encoder', 'Encoder'),
  ('radiology_staff', 'Radiology Staff'),
  ('drug_test_staff', 'Drug Testing Staff')
on conflict (code) do update set name = excluded.name;

alter table public.staff_profiles
  add column if not exists department_id uuid references public.departments (id) on delete restrict,
  add column if not exists job_position_id uuid references public.job_positions (id) on delete restrict;

update public.staff_profiles as staff
set department_id = department.id
from public.departments as department
where department.code = case staff.role::text
  when 'admin' then 'administration'
  when 'cashier' then 'front_desk'
  when 'blood_test' then 'laboratory'
  when 'xray' then 'radiology'
  when 'doctor' then 'clinical_exam'
  when 'nurse' then 'clinical_exam'
  when 'drug_test' then 'drug_testing'
  when 'ecg' then 'clinical_exam'
  when 'encoder' then 'administration'
  when 'pathologist' then 'laboratory'
  else 'administration'
end
and staff.department_id is null;

update public.staff_profiles as staff
set job_position_id = position.id
from public.job_positions as position
where position.code = case staff.role::text
  when 'admin' then 'administrator'
  when 'cashier' then 'front_desk_cashier'
  when 'blood_test' then 'medical_technologist'
  when 'xray' then 'radiology_staff'
  when 'doctor' then 'doctor'
  when 'nurse' then 'nurse'
  when 'drug_test' then 'drug_test_staff'
  when 'ecg' then 'nurse'
  when 'encoder' then 'encoder'
  when 'pathologist' then 'encoder'
  else 'encoder'
end
and staff.job_position_id is null;

create type public.medtech_daily_role as enum ('extractor', 'tester');

create table if not exists public.staff_daily_roles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  work_date date not null default (timezone('Asia/Manila', now())::date),
  role public.medtech_daily_role not null,
  selected_at timestamptz not null default timezone('utc', now()),
  unique (staff_id, work_date)
);

create index if not exists staff_daily_roles_staff_date_idx
  on public.staff_daily_roles (staff_id, work_date desc);

alter table public.patients
  add column if not exists profile_photo_path text;

create table if not exists public.patient_test_instances (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  visit_id uuid references public.visits (id) on delete set null,
  lab_order_item_id uuid references public.lab_order_items (id) on delete set null,
  test_type text not null,
  sequence_number integer not null default 1,
  status text not null default 'draft',
  result_payload jsonb not null default '{}'::jsonb,
  notes text,
  encoded_by uuid references public.staff_profiles (id) on delete set null,
  encoded_at timestamptz,
  validated_by uuid references public.staff_profiles (id) on delete set null,
  validated_at timestamptz,
  released_by uuid references public.staff_profiles (id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint patient_test_instances_type_check check (
    test_type in ('physical_exam', 'cbc', 'urinalysis', 'fecalysis', 'serology', 'xray', 'drug_test', 'ecg')
  ),
  constraint patient_test_instances_status_check check (
    status in ('draft', 'completed', 'validated', 'released')
  ),
  unique (patient_id, visit_id, test_type, sequence_number)
);

create index if not exists patient_test_instances_patient_idx
  on public.patient_test_instances (patient_id, test_type, sequence_number);

alter table public.patient_test_instances
  drop constraint if exists patient_test_instances_type_check;

alter table public.patient_test_instances
  add constraint patient_test_instances_type_check check (
    test_type in ('physical_exam', 'cbc', 'urinalysis', 'fecalysis', 'serology', 'xray', 'drug_test', 'ecg')
  );

drop trigger if exists set_updated_at_departments on public.departments;
create trigger set_updated_at_departments
before update on public.departments
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_job_positions on public.job_positions;
create trigger set_updated_at_job_positions
before update on public.job_positions
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_patient_test_instances on public.patient_test_instances;
create trigger set_updated_at_patient_test_instances
before update on public.patient_test_instances
for each row execute function public.set_updated_at();

alter table public.departments enable row level security;
alter table public.job_positions enable row level security;
alter table public.staff_daily_roles enable row level security;
alter table public.patient_test_instances enable row level security;

create policy "authenticated staff read departments"
on public.departments for select to authenticated using (true);

create policy "authenticated staff read job positions"
on public.job_positions for select to authenticated using (true);

create policy "staff read own daily role"
on public.staff_daily_roles for select to authenticated
using (staff_id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

create policy "staff read patient test instances"
on public.patient_test_instances for select to authenticated
using (public.current_app_role() is not null);

insert into storage.buckets (id, name, public)
values ('patient-profile-photos', 'patient-profile-photos', false)
on conflict (id) do update set public = false;

create policy "authenticated staff read patient profile photos"
on storage.objects for select to authenticated
using (bucket_id = 'patient-profile-photos' and public.current_app_role() is not null);

create policy "authorized staff upload patient profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'patient-profile-photos'
  and public.has_role(array['admin', 'nurse', 'cashier', 'encoder']::public.app_role[])
);

create policy "authorized staff replace patient profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'patient-profile-photos'
  and public.has_role(array['admin', 'nurse', 'cashier', 'encoder']::public.app_role[])
)
with check (
  bucket_id = 'patient-profile-photos'
  and public.has_role(array['admin', 'nurse', 'cashier', 'encoder']::public.app_role[])
);
