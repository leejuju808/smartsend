-- 004_mailbox_oauth_gmail.sql
-- Extend mailboxes table for Gmail OAuth tokens

alter table mailboxes
  add column if not exists email text,
  add column if not exists oauth jsonb; -- { provider:"google", refresh_token, access_token?, expiry?, scope }

create index if not exists idx_mailboxes_user on mailboxes(user_id);

-- RLS Policies for mailboxes
alter table mailboxes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='read_own_mailboxes') then
    create policy read_own_mailboxes on mailboxes
      for select using (auth.uid() = user_id);
  end if;
end $$;

