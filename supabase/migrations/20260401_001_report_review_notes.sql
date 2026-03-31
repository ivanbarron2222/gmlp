alter table public.reports
add column if not exists review_notes text,
add column if not exists review_flagged_at timestamptz;
