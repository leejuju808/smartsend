-- Template Rendering System
-- Adds lead fields, campaign variables, unsubscribe helpers, and render_context function

-- A) Lead core fields + custom bag
alter table public.leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists title text,
  add column if not exists website text,
  add column if not exists custom jsonb default '{}'::jsonb;

-- B) Campaign-level variables (optional; else use campaigns.meta jsonb)
create table if not exists public.campaign_vars (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  key text not null,
  value text,
  unique (campaign_id, key)
);

create index if not exists idx_campaign_vars_campaign on public.campaign_vars(campaign_id);

-- C) Unsubscribe token + URL helper (token stored on thread or lead)
alter table public.leads
  add column if not exists unsubscribe_token text;

create index if not exists idx_leads_unsubscribe_token on public.leads(unsubscribe_token) where unsubscribe_token is not null;

create or replace function public.ensure_unsub_token(p_lead uuid)
returns text
language plpgsql volatile as $$
declare v text; 
begin
  select unsubscribe_token into v from public.leads where id = p_lead;
  if v is null then
    v := encode(gen_random_bytes(16),'hex');
    update public.leads set unsubscribe_token = v where id = p_lead;
  end if;
  return v;
end $$;

-- Your public site base is assumed in connected_accounts.provider_domain or campaigns.meta
-- Note: Update this to use your edge function URL if needed
create or replace function public.unsubscribe_url(p_lead uuid)
returns text language sql stable as $$
  select coalesce(
    current_setting('app.supabase_url', true),
    'https://smartsendhq.com'
  ) || '/functions/v1/unsubscribe/u/' || public.ensure_unsub_token(p_lead);
$$;

-- D) Collect render context for (campaign, lead)
create or replace function public.render_context(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql stable as $$
declare
  v_campaign jsonb;
  v_lead jsonb;
  v_account jsonb;
  v_vars jsonb := '{}'::jsonb;
  v_account_id uuid;
begin
  -- Get campaign
  select to_jsonb(c.*) into v_campaign
  from public.campaigns c
  where c.id = p_campaign;
  
  -- Get lead
  select to_jsonb(l.*) into v_lead
  from public.leads l
  where l.id = p_lead;
  
  -- Get account (try account_id or sender_profile_id from campaign)
  select coalesce(c.account_id, c.sender_profile_id) into v_account_id
  from public.campaigns c
  where c.id = p_campaign;
  
  if v_account_id is not null then
    select to_jsonb(ca.*) into v_account
    from public.connected_accounts ca
    where ca.id = v_account_id;
  end if;
  
  -- Get campaign vars
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_vars
  from public.campaign_vars
  where campaign_id = p_campaign;
  
  return jsonb_build_object(
    'lead', coalesce(v_lead, '{}'::jsonb),
    'campaign', coalesce(v_campaign, '{}'::jsonb),
    'account', coalesce(v_account, '{}'::jsonb),
    'vars', v_vars,
    'now_iso', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'today', to_char(now(), 'YYYY-MM-DD'),
    'unsubscribe_url', public.unsubscribe_url(p_lead)
  );
end;
$$;

-- E) Add rendered columns to send_logs
alter table public.send_logs
  add column if not exists subject_rendered text,
  add column if not exists body_rendered text;

-- F) Ensure campaigns has meta column (for backward compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'meta'
  ) then
    alter table public.campaigns add column meta jsonb default '{}'::jsonb;
  end if;
end $$;

-- G) Test sends table (for test/preview sends, separate from send_logs)
create table if not exists public.test_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  step_no int,
  to_email text not null,
  subject text,
  body_html text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_test_sends_campaign on public.test_sends(campaign_id);
create index if not exists idx_test_sends_created_at on public.test_sends(created_at);

