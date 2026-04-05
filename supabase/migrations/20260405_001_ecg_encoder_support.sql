alter type public.app_role add value if not exists ''ecg'';
alter type public.app_role add value if not exists ''encoder'';
alter type public.lab_service_type add value if not exists ''ecg'';
alter type public.queue_lane add value if not exists ''ecg'';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_lane_check;

alter table public.staff_profiles
  add constraint staff_profiles_lane_check check (
    assigned_lane is null
    or assigned_lane in (''blood_test'', ''drug_test'', ''doctor'', ''xray'', ''ecg'')
  );

create or replace function public.can_access_queue_lane(target_lane public.queue_lane)
returns boolean
language sql
stable
as $$
  select case
    when public.has_role(array[''admin'', ''nurse'']::public.app_role[]) then true
    when public.current_app_role() = ''blood_test'' then target_lane = ''blood_test''
    when public.current_app_role() = ''drug_test'' then target_lane = ''drug_test''
    when public.current_app_role() = ''doctor'' then target_lane = ''doctor''
    when public.current_app_role() = ''xray'' then target_lane = ''xray''
    when public.current_app_role() = ''ecg'' then target_lane = ''ecg''
    when public.current_app_role() = ''cashier'' then false
    when public.current_app_role() = ''encoder'' then false
    when public.current_app_role() = ''pathologist'' then target_lane in (''blood_test'', ''drug_test'', ''xray'', ''ecg'')
    else false
  end
$$;
