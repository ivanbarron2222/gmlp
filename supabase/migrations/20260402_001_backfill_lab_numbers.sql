do $$
declare
  next_number integer;
  backfill_visit record;
  created_lab_order_id uuid;
begin
  select coalesce(
    max(
      case
        when order_number ~* '^LAB-\d+$'
          then substring(order_number from 'LAB-(\d+)')::integer
        else null
      end
    ),
    0
  )
  into next_number
  from public.lab_orders;

  for backfill_visit in
    select lo.id
    from public.lab_orders lo
    where lo.order_number !~* '^LAB-\d+$'
    order by lo.created_at asc, lo.id asc
  loop
    next_number := next_number + 1;

    update public.lab_orders
    set
      order_number = 'LAB-' || lpad(next_number::text, 3, '0'),
      updated_at = timezone('utc', now())
    where id = backfill_visit.id;
  end loop;

  for backfill_visit in
    select
      v.id as visit_id,
      v.patient_id,
      v.service_type,
      v.requested_lab_service,
      v.created_at
    from public.visits v
    left join public.lab_orders lo on lo.visit_id = v.id
    where lo.id is null
      and (
        v.service_type in ('pre_employment', 'lab')
        or exists (
          select 1
          from public.machine_imports mi
          where mi.visit_id = v.id
        )
      )
    order by v.created_at asc, v.id asc
  loop
    next_number := next_number + 1;

    insert into public.lab_orders (
      order_number,
      visit_id,
      patient_id,
      source,
      status,
      created_at,
      updated_at
    )
    values (
      'LAB-' || lpad(next_number::text, 3, '0'),
      backfill_visit.visit_id,
      backfill_visit.patient_id,
      case
        when backfill_visit.service_type = 'pre_employment' then 'system_pre_employment'::public.order_source
        else 'direct_lab'::public.order_source
      end,
      'ordered'::public.order_status,
      backfill_visit.created_at,
      timezone('utc', now())
    )
    returning id into created_lab_order_id;

    if backfill_visit.service_type = 'pre_employment' then
      insert into public.lab_order_items (
        lab_order_id,
        service_lane,
        requested_lab_service,
        test_code,
        test_name,
        sample_id,
        created_at,
        updated_at
      )
      values
        (
          created_lab_order_id,
          'blood_test',
          'blood_test',
          'PRE-BLOOD',
          'Pre-Employment Blood Test',
          gen_random_uuid()::text,
          backfill_visit.created_at,
          timezone('utc', now())
        ),
        (
          created_lab_order_id,
          'drug_test',
          'drug_test',
          'PRE-DRUG',
          'Pre-Employment Drug Test',
          gen_random_uuid()::text,
          backfill_visit.created_at,
          timezone('utc', now())
        ),
        (
          created_lab_order_id,
          'xray',
          'xray',
          'PRE-XRAY',
          'Pre-Employment Xray',
          gen_random_uuid()::text,
          backfill_visit.created_at,
          timezone('utc', now())
        );
    elsif backfill_visit.service_type = 'lab' and backfill_visit.requested_lab_service is not null then
      insert into public.lab_order_items (
        lab_order_id,
        service_lane,
        requested_lab_service,
        test_code,
        test_name,
        sample_id,
        created_at,
        updated_at
      )
      values (
        created_lab_order_id,
        backfill_visit.requested_lab_service,
        backfill_visit.requested_lab_service,
        'LAB-' || upper(backfill_visit.requested_lab_service::text),
        case backfill_visit.requested_lab_service
          when 'blood_test' then 'Blood Test Service'
          when 'drug_test' then 'Drug Test Service'
          when 'xray' then 'Xray Service'
          else 'Lab Service'
        end,
        gen_random_uuid()::text,
        backfill_visit.created_at,
        timezone('utc', now())
      );
    end if;
  end loop;
end $$;
