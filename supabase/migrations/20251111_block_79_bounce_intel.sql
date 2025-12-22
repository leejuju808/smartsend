-- Block 79: Bounce intelligence (schema, maps, jobs, hooks)

-- 1) Reference: SMTP/DSN code map
create table if not exists public.smtp_dsn_map (
  code text primary key,                           -- e.g. '5.1.1', '550', '4.4.2'
  class text not null check (class in ('hard','soft')),
  reason text not null,                            -- 'user_unknown','mailbox_full','policy_block','domain_error','rate_limit','timeout','other'
  description text
);

-- Seed common codes (idempotent)
insert into public.smtp_dsn_map(code,class,reason,description) values
('5.1.1','hard','user_unknown','Bad destination mailbox address'),
('5.2.2','soft','mailbox_full','Mailbox full'),
('5.7.1','hard','policy_block','Delivery not authorized'),
('4.4.2','soft','timeout','Bad connection/timeout'),
('550','hard','user_unknown','Mailbox unavailable'),
('552','soft','mailbox_full','Storage allocation exceeded'),
('421','soft','rate_limit','Service not available')
on conflict (code) do nothing;

-- 2) Suppression list (per-account)
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  reason text not null,                            -- 'hard_bounce','manual','complaint'
  meta jsonb not null default '{}'::jsonb,
  unique (account_id, email)
);

-- 3) Bounce events (normalized)
create table if not exists public.bounce_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  send_id uuid references public.email_sends(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  email text not null,
  smtp_code text,
  dsn_code text,
  class text not null check (class in ('hard','soft')),
  reason text not null,
  provider text,                                   -- 'sendgrid','resend','mailgun', etc.
  raw jsonb not null default '{}'::jsonb
);
create index if not exists idx_bounce_events_account on public.bounce_events(account_id);
create index if not exists idx_bounce_events_lead on public.bounce_events(lead_id);

-- 4) Verify jobs (async)
create table if not exists public.email_verify_jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email text not null,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  verdict text,                                    -- 'valid','invalid','accept_all','unknown'
  score numeric,                                   -- 0..1
  last_error text
);
create index if not exists idx_email_verify_jobs_status on public.email_verify_jobs(status);

-- 5) Alt-email store (optional enrichment target)
create table if not exists public.lead_alt_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  email text not null,
  source text not null,                             -- 'manual','enrichment','reply_signature'
  confidence numeric not null default 0.7,
  unique (lead_id, email)
);

-- 6) Lead email status fields (safety)
do $$ begin
  alter table public.leads add column if not exists email_status text; -- 'valid','invalid','unknown','risky'
exception when duplicate_column then null; end $$;

-- 7) Hook: on hard bounce → suppress + route verify_alt + enqueue verify
create or replace function public.fn_apply_bounce_actions(
  p_account_id uuid,
  p_lead_id uuid,
  p_email text,
  p_class text,
  p_reason text
) returns void language plpgsql as $$
begin
  if p_class = 'hard' then
    insert into public.email_suppressions(account_id, email, reason, meta)
    values (p_account_id, lower(p_email), 'hard_bounce', jsonb_build_object('reason', p_reason))
    on conflict (account_id, email) do nothing;

    update public.leads
       set next_nudge_preset = 'verify_alt',
           email_status = 'invalid',
           updated_at = now()
     where id = p_lead_id;

  else
    -- soft: mark risky; scheduler may retry
    update public.leads
       set email_status = coalesce(email_status,'risky'),
           updated_at = now()
     where id = p_lead_id;
  end if;

  -- always enqueue a verification job (cheap API)
  insert into public.email_verify_jobs(account_id, lead_id, email)
  values (p_account_id, p_lead_id, lower(p_email));
end $$;

-- 8) RPC: record a bounce (used by webhook)
create or replace function public.rpc_record_bounce(
  p_account_id uuid,
  p_send_id uuid,
  p_lead_id uuid,
  p_email text,
  p_smtp_code text,
  p_dsn_code text,
  p_provider text,
  p_raw jsonb
) returns void language plpgsql
security definer
as $$
declare
  v_class text; v_reason text;
begin
  -- map DSN/SMTP to class/reason
  select m.class, m.reason into v_class, v_reason
  from public.smtp_dsn_map m
  where m.code = coalesce(p_dsn_code, p_smtp_code);

  if v_class is null then
    v_class := case
      when p_smtp_code ~ '^5' then 'hard'
      when p_smtp_code ~ '^4' then 'soft'
      else 'soft'
    end;
    v_reason := 'other';
  end if;

  insert into public.bounce_events(account_id, send_id, lead_id, email, smtp_code, dsn_code, class, reason, provider, raw)
  values (p_account_id, p_send_id, p_lead_id, lower(p_email), p_smtp_code, p_dsn_code, v_class, v_reason, p_provider, coalesce(p_raw,'{}'::jsonb));

  -- side effects
  perform public.fn_apply_bounce_actions(p_account_id, p_lead_id, p_email, v_class, v_reason);

  -- also reflect in outcomes (Block 78)
  if p_send_id is not null then
    insert into public.email_events(account_id, send_id, type, meta)
    values (p_account_id, p_send_id, 'bounce', jsonb_build_object('smtp', p_smtp_code, 'dsn', p_dsn_code))
    on conflict do nothing;
  end if;
end $$;

-- 9) Safety: RLS (adapt tenant model)
alter table public.smtp_dsn_map enable row level security; -- read-only? allow all if needed
create policy smtp_dsn_map_read on public.smtp_dsn_map for select using (true);

alter table public.email_suppressions enable row level security;
create policy suppressions_isolation on public.email_suppressions using (account_id = auth.uid());

alter table public.bounce_events enable row level security;
create policy bounce_isolation on public.bounce_events using (account_id = auth.uid());

alter table public.email_verify_jobs enable row level security;
create policy email_verify_isolation on public.email_verify_jobs using (account_id = auth.uid());

