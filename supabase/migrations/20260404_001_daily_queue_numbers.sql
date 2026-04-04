alter table public.queue_entries
  add column if not exists queue_date date;

update public.queue_entries
set queue_date = (created_at at time zone 'Asia/Manila')::date
where queue_date is null;

alter table public.queue_entries
  alter column queue_date set default (timezone('Asia/Manila', now())::date);

alter table public.queue_entries
  alter column queue_date set not null;

alter table public.queue_entries
  drop constraint if exists queue_entries_queue_number_key;

alter table public.queue_entries
  drop constraint if exists queue_entries_queue_number_queue_date_key;

alter table public.queue_entries
  add constraint queue_entries_queue_number_queue_date_key unique (queue_number, queue_date);

create index if not exists queue_entries_queue_date_idx
  on public.queue_entries (queue_date, created_at desc);
