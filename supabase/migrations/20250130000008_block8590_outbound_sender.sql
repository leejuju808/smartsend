-- =========================================================
-- Block 8590 — Outbound Sender v1 (Actually Send the Cold Emails)
-- =========================================================

-- Add owner_id column to outbound_emails if missing
-- This ties each email to the account that owns it
alter table public.outbound_emails
  add column if not exists owner_id uuid;

-- Create index for owner_id lookups
create index if not exists idx_outbound_emails_owner_id
  on public.outbound_emails(owner_id);

-- Add foreign key constraint if auth.users exists
-- Note: This may fail if auth schema doesn't exist, so we'll make it optional
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'auth' 
    and table_name = 'users'
  ) then
    -- Add foreign key constraint
    if not exists (
      select 1 from pg_constraint 
      where conname = 'outbound_emails_owner_id_fkey'
    ) then
      alter table public.outbound_emails
        add constraint outbound_emails_owner_id_fkey
        foreign key (owner_id)
        references auth.users(id)
        on delete set null;
    end if;
  end if;
end $$;

























































