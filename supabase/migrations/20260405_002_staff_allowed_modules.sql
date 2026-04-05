alter table public.staff_profiles
  add column if not exists allowed_modules text[] not null default '{}';

update public.staff_profiles
set allowed_modules = case role
  when 'admin' then array[
    '/dashboard',
    '/staff/patient-registration',
    '/staff/queue',
    '/staff/cashier',
    '/staff/patient-records',
    '/staff/lab-orders',
    '/staff/specimen-tracking',
    '/staff/result-encoding',
    '/staff/result-release',
    '/staff/settings'
  ]::text[]
  when 'nurse' then array[
    '/dashboard',
    '/staff/patient-registration',
    '/staff/queue',
    '/staff/patient-records'
  ]::text[]
  when 'blood_test' then array[
    '/dashboard',
    '/staff/queue',
    '/staff/lab-orders'
  ]::text[]
  when 'drug_test' then array[
    '/dashboard',
    '/staff/queue',
    '/staff/lab-orders'
  ]::text[]
  when 'doctor' then array[
    '/dashboard',
    '/staff/queue',
    '/staff/result-encoding',
    '/staff/patient-records'
  ]::text[]
  when 'xray' then array[
    '/dashboard',
    '/staff/queue',
    '/staff/lab-orders'
  ]::text[]
  when 'ecg' then array[
    '/dashboard',
    '/staff/queue',
    '/staff/lab-orders'
  ]::text[]
  when 'encoder' then array[
    '/dashboard',
    '/staff/patient-records',
    '/staff/result-release'
  ]::text[]
  when 'cashier' then array[
    '/dashboard',
    '/staff/patient-registration',
    '/staff/queue',
    '/staff/cashier',
    '/staff/patient-records',
    '/staff/result-release'
  ]::text[]
  when 'pathologist' then array[
    '/dashboard',
    '/staff/result-release',
    '/staff/patient-records'
  ]::text[]
  else array['/dashboard']::text[]
end
where allowed_modules = '{}'::text[] or allowed_modules is null;

