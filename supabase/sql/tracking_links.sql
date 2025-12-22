-- Tracking domain and click analytics schema

-- A) Account-level tracking domain config
create table if not exists public.tracking_domains (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  domain text not null,
  status text not null default 'pending',
  cname_target text not null default 'trk.smartsend.ai.',
  updated_at timestamptz not null default now()
);

-- B) One token per (message × original_url)
create table if not exists public.message_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  message_id text,
  original_url text not null,
  token text not null unique,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  is_unsubscribe boolean not null default false
);

create index if not exists idx_message_links_account on public.message_links(account_id);
create index if not exists idx_message_links_lead on public.message_links(lead_id);

-- C) Click events (immutable)
create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  message_id text,
  token text not null references public.message_links(token) on delete cascade,
  ip inet,
  ua text,
  referrer text
);

create index if not exists idx_click_events_account on public.click_events(account_id, created_at);
create index if not exists idx_click_events_token on public.click_events(token);

-- D) Derived views for UI
create or replace view public.link_click_stats as
select
  ml.account_id,
  ml.campaign_id,
  ml.lead_id,
  ml.message_id,
  ml.original_url,
  ml.token,
  ml.is_unsubscribe,
  count(ce.*)::int as clicks
from public.message_links ml
left join public.click_events ce on ce.token = ml.token
group by ml.account_id, ml.campaign_id, ml.lead_id, ml.message_id, ml.original_url, ml.token, ml.is_unsubscribe;

-- E) RLS policies (enable and provide read access for account members)
alter table public.tracking_domains enable row level security;
alter table public.message_links   enable row level security;
alter table public.click_events    enable row level security;

do $$
begin
  create policy "read_own_tracking" on public.tracking_domains for select using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = tracking_domains.account_id
        and tm.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "read_own_links" on public.message_links for select using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = message_links.account_id
        and tm.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "read_own_clicks" on public.click_events for select using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = click_events.account_id
        and tm.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

