insert into public.service_catalog (service_code, service_name, category, amount, sort_order, service_lane, is_active)
values
  ('svc-blood-test', 'Blood Test Service', 'Laboratory', 250, 3, 'blood_test', true),
  ('svc-drug-test', 'Drug Test Service', 'Laboratory', 350, 4, 'drug_test', true),
  ('svc-xray', 'Xray Service', 'Imaging', 650, 5, 'xray', true),
  ('svc-ecg', 'ECG Service', 'Laboratory', 350, 6, 'ecg', true)
on conflict (service_code) do update
set
  service_name = excluded.service_name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  service_lane = excluded.service_lane,
  is_active = true;

update public.partner_company_packages
set service_codes = array['svc-blood-test', 'svc-drug-test', 'svc-xray']
where package_code = 'pre-employment'
  and (
    service_codes is null
    or array_length(service_codes, 1) is null
    or service_codes = array['svc-ecg']
    or service_codes = array['svc-pre-employment']
  );
