alter table public.queue_entries
  add column if not exists notification_ping_count integer not null default 0,
  add column if not exists last_ping_at timestamptz,
  add column if not exists response_at timestamptz;

create index if not exists queue_entries_notification_ping_idx
  on public.queue_entries (queue_status, response_at, last_ping_at, notification_ping_count);
