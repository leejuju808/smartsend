-- Create campaign_recipients table to queue and track sends per recipient
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_lower text not null,
  name text,
  status text not null default 'queued', -- queued | sent | failed | skipped
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_status on public.campaign_recipients(status);
create unique index if not exists uniq_campaign_recipient on public.campaign_recipients(campaign_id, email_lower);

alter table if exists public.campaign_recipients enable row level security;

drop policy if exists "campaign_recipients_select_own" on public.campaign_recipients;
create policy if not exists "campaign_recipients_select_own" on public.campaign_recipients
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "campaign_recipients_mutate_own" on public.campaign_recipients;
create policy if not exists "campaign_recipients_mutate_own" on public.campaign_recipients
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id and c.user_id = auth.uid()
    )
  );

