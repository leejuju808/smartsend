-- Add unique constraint on user_id for gmail_accounts table
-- This allows upsert operations using onConflict: "user_id"

-- First, remove any duplicate user_id entries if they exist
-- (Keep the most recent one)
delete from public.gmail_accounts
where id not in (
  select distinct on (user_id) id
  from public.gmail_accounts
  order by user_id, created_at desc
);

-- Add unique constraint
create unique index if not exists gmail_accounts_user_id_unique 
on public.gmail_accounts(user_id);
