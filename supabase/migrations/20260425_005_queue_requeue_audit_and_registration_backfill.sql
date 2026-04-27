alter table public.queue_entries
  add column if not exists previous_queue_number text,
  add column if not exists last_requeued_at timestamptz,
  add column if not exists requeue_count integer not null default 0;

create index if not exists queue_entries_requeue_audit_idx
  on public.queue_entries (queue_status, last_requeued_at desc, requeue_count desc);

with ranked as (
  select
    id,
    'REG-' || lpad(row_number() over (order by created_at, id)::text, 6, '0') as new_code
  from public.self_registrations
  where registration_code is null
     or registration_code = ''
     or registration_code !~ '^REG-[A-Z0-9]{6}$'
)
update public.self_registrations as target
set registration_code = ranked.new_code
from ranked
where target.id = ranked.id;
