alter table public.email_accounts add column if not exists created_by uuid;
create unique index if not exists uq_email_accounts_ws_email
  on public.email_accounts (workspace_id, email);

-- RLS (example)
create policy "select own accounts" on public.email_accounts
  for select to authenticated using (auth.uid() = user_id and workspace_id = current_setting('request.jwt.claims'::text, true)::jsonb->>'workspace_id');

-- writes only by service role (no insert/update policies for authenticated)