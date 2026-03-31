-- Create the staff auth users first in Supabase Authentication.
-- Then replace the UUIDs below with the real auth.users IDs for each account.
--
-- You can get those IDs with:
-- select id, email from auth.users order by created_at desc;

insert into public.staff_profiles (
  id,
  email,
  full_name,
  role,
  assigned_lane,
  is_active
)
values
  (
    'a1aa6f73-6179-4d9b-b8f6-244fa8fe1188',
    'nurse@globalife.local',
    'Nurse / Reception',
    'nurse',
    null,
    true
  ),
  (
    'de9f029d-2902-4122-8235-019e8bab55d0',
    'bloodtest@globalife.local',
    'Blood Test Station',
    'blood_test',
    'blood_test',
    true
  ),
  (
    'd80d45fd-3cf5-4fdf-948a-e527a6b8d5ef',
    'drugtest@globalife.local',
    'Drug Test Station',
    'drug_test',
    'drug_test',
    true
  ),
  (
    'ddefea2c-8c20-419f-8a1e-ecf014afa369',
    'doctor@globalife.local',
    'Doctor Station',
    'doctor',
    'doctor',
    true
  ),
  (
    '2d2a7bdd-2858-443f-8c3b-85f61ed5a494',
    'xray@globalife.local',
    'Xray Station',
    'xray',
    'xray',
    true
  ),
  (
    'e4fe839f-4ce9-4a1a-9801-9231f7c2f01a',
    'cashier@globalife.local',
    'Cashier / Billing',
    'cashier',
    null,
    true
  )
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  assigned_lane = excluded.assigned_lane,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
