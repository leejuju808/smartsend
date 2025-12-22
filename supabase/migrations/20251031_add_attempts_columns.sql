-- Add attempts tracking columns to leads table
alter table public.leads
  add column if not exists attempts int not null default 0,
  add column if not exists max_attempts int not null default 3;

-- Update send_attempts to attempts if send_attempts column exists
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'send_attempts') then
    update public.leads set attempts = send_attempts where attempts = 0;
    alter table public.leads drop column if exists send_attempts;
  end if;
end $$;

