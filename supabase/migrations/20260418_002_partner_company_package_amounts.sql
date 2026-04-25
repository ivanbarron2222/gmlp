alter table public.partner_company_packages
  add column if not exists amount numeric(12,2) not null default 0;
