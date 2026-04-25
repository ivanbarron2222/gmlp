alter type public.queue_status add value if not exists 'missed';
alter type public.queue_status add value if not exists 'requeue_required';

alter table public.queue_entries
  add column if not exists missed_at timestamptz,
  add column if not exists requeue_required_at timestamptz;

create index if not exists queue_entries_date_status_idx
  on public.queue_entries (queue_date, queue_status, current_lane, priority_lane, created_at);
