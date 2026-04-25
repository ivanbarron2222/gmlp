alter table public.service_catalog
  add column if not exists service_lane text;

alter table public.service_catalog
  drop constraint if exists service_catalog_service_lane_check;

alter table public.service_catalog
  add constraint service_catalog_service_lane_check check (
    service_lane is null
    or service_lane in ('blood_test', 'drug_test', 'xray', 'ecg')
  );

alter table public.self_registrations
  add column if not exists requested_service_codes text[] not null default '{}';

alter table public.visits
  add column if not exists requested_service_codes text[] not null default '{}';

alter table public.queue_entries
  add column if not exists requested_service_codes text[] not null default '{}';

update public.service_catalog
set service_lane = case service_code
  when 'svc-blood-test' then 'blood_test'
  when 'svc-drug-test' then 'drug_test'
  when 'svc-xray' then 'xray'
  when 'svc-ecg' then 'ecg'
  else service_lane
end
where service_code in ('svc-blood-test', 'svc-drug-test', 'svc-xray', 'svc-ecg');

insert into public.service_catalog (service_code, service_name, category, amount, sort_order, service_lane)
values ('svc-ecg', 'ECG Service', 'Laboratory', 350, 6, 'ecg')
on conflict (service_code) do update
set service_lane = excluded.service_lane;

update public.partner_company_packages
set service_codes = array['svc-blood-test', 'svc-drug-test', 'svc-xray']
where package_code = 'pre-employment'
  and (service_codes is null or array_length(service_codes, 1) is null or service_codes = array['svc-pre-employment']);

update public.partner_company_packages
set service_codes = array['svc-blood-test']
where package_code = 'lab'
  and (service_codes is null or array_length(service_codes, 1) is null);
