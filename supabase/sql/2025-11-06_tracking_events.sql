-- Tracking events schema and helper functions

-- A) Event tables

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  send_log_id uuid references public.send_logs(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  type text not null check (type in ('open','click')),
  url text,
  ua text,
  ip inet,
  country text,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_te_campaign_time on public.tracking_events(campaign_id, created_at desc);
create index if not exists idx_te_lead_time on public.tracking_events(lead_id, created_at desc);
create index if not exists idx_te_sendlog_type on public.tracking_events(send_log_id, type);


-- B) Token registry (opaque tokens for links/pixels)

create table if not exists public.tracking_tokens (
  token text primary key,
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  send_log_id uuid references public.send_logs(id) on delete set null,
  type text not null check (type in ('open','click')),
  url text,
  expires_at timestamptz,
  used_at timestamptz
);

create index if not exists idx_tt_campaign_lead on public.tracking_tokens(campaign_id, lead_id);
create index if not exists idx_tt_sendlog on public.tracking_tokens(send_log_id);


-- C) Fast campaign metrics (views)

create or replace view public.v_campaign_metrics as
select
  c.id as campaign_id,
  count(distinct sl.id) filter (where sl.id is not null) as sent,
  count(distinct case when te.type = 'open' then te.lead_id end) as unique_opens,
  count(*) filter (where te.type = 'open') as total_opens,
  count(distinct case when te.type = 'click' then te.lead_id end) as unique_clicks,
  count(*) filter (where te.type = 'click') as total_clicks
from public.campaigns c
left join public.send_logs sl on sl.campaign_id = c.id
left join public.tracking_events te on te.campaign_id = c.id
group by 1;


-- D) Per-variant and per-step breakdowns

create or replace view public.v_metrics_by_step_variant as
select
  sl.campaign_id,
  sl.step_no,
  sl.variant_id,
  count(distinct sl.id) as sent,
  count(distinct case when te.type = 'open' then te.lead_id end) as unique_opens,
  count(distinct case when te.type = 'click' then te.lead_id end) as unique_clicks
from public.send_logs sl
left join public.tracking_events te on te.send_log_id = sl.id
group by 1, 2, 3;


-- E) Helper: mint tokens

create or replace function public.mint_tracking_token(
  p_type text,
  p_campaign uuid,
  p_lead uuid,
  p_send_log uuid,
  p_url text default null,
  p_ttl_minutes int default 0
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok text := encode(gen_random_bytes(16), 'hex');
  v_exp timestamptz := case when p_ttl_minutes > 0 then now() + make_interval(mins => p_ttl_minutes) else null end;
begin
  if p_type not in ('open','click') then
    raise exception 'bad type';
  end if;

  insert into public.tracking_tokens(token, campaign_id, lead_id, send_log_id, type, url, expires_at)
  values (v_tok, p_campaign, p_lead, p_send_log, p_type, p_url, v_exp);

  return v_tok;
end;
$$;


-- F) Helper: record event (used by Edge routes)

create or replace function public.record_tracking_event(
  p_token text,
  p_type text,
  p_ua text,
  p_ip inet,
  p_country text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tracking_tokens%rowtype;
  v_id uuid;
begin
  select * into t from public.tracking_tokens where token = p_token;

  if not found then
    return null;
  end if;

  if t.expires_at is not null and t.expires_at < now() then
    return null;
  end if;

  if p_type <> t.type then
    -- still record under requested type, but keep associations
    null;
  end if;

  insert into public.tracking_events(
    campaign_id,
    lead_id,
    send_log_id,
    account_id,
    type,
    url,
    ua,
    ip,
    country
  )
  values (
    t.campaign_id,
    t.lead_id,
    t.send_log_id,
    (select account_id from public.send_logs where id = t.send_log_id),
    p_type,
    t.url,
    p_ua,
    p_ip,
    p_country
  )
  returning id into v_id;

  if p_type = 'click' and t.used_at is null then
    update public.tracking_tokens set used_at = now() where token = p_token;
  end if;

  return v_id;
end;
$$;


-- G) Lightweight RLS (optional; typically events are server-only)

alter table public.tracking_events enable row level security;
drop policy if exists te_reader on public.tracking_events;
create policy te_reader on public.tracking_events
for select using (
  exists (
    select 1
    from public.campaigns c
    where c.id = tracking_events.campaign_id
      and c.user_id = auth.uid()
  )
);

alter table public.tracking_tokens enable row level security;
drop policy if exists tt_none on public.tracking_tokens;
create policy tt_none on public.tracking_tokens for select using (false);












