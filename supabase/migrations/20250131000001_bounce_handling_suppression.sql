-- Block 110: Bounce Handling & Global Suppression List
-- Creates suppression list, bounce tracking, and guardrails

-- 1) Canonical suppression list (one row per lead/account per reason)
create type public.suppress_reason as enum ('bounce','unsubscribe','complaint','manual','spamtrap');

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email text not null,
  reason public.suppress_reason not null,
  source text,                      -- 'gmail_webhook','outlook_webhook','reply_brain','user'
  details jsonb
);

create unique index if not exists suppressions_unique on public.suppressions(account_id, email);

alter table public.suppressions enable row level security;
create policy "acct manages own suppressions"
  on public.suppressions
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 2) Detailed bounce events
create table if not exists public.email_bounces (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  send_id uuid references public.campaign_sends(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  bounce_type text,        -- 'hard','soft','blocked','policy','unknown'
  smtp_code text,          -- e.g. '550', '421'
  diag text,               -- diagnostic / DSN
  raw jsonb                -- original parsed payload
);

create index if not exists email_bounces_account on public.email_bounces(account_id, created_at desc);

alter table public.email_bounces enable row level security;
create policy "acct sees own bounces"
  on public.email_bounces for select using (account_id = auth.uid());

-- 3) Helpers to set bounced + add to suppression
create or replace function public.apply_bounce(p_account_id uuid, p_email text, p_lead_id uuid, p_payload jsonb)
returns void language plpgsql security definer as $$
declare v_reason text; v_code text; v_type text;
begin
  v_code  := coalesce(p_payload->>'smtp_code', p_payload#>>'{headers,Status}');
  v_type  := coalesce(p_payload->>'bounce_type','hard');

  -- insert suppression
  insert into public.suppressions (account_id, lead_id, email, reason, source, details)
  values (p_account_id, p_lead_id, p_email, 'bounce', 'webhook', p_payload)
  on conflict (account_id, email) do update
    set reason = 'bounce', details = excluded.details;

  -- flag lead
  if p_lead_id is not null then
    update public.leads set bounced = true where id = p_lead_id;
    update public.sequences set status='paused'
      where lead_id = p_lead_id and status='active';
  end if;
end$$;

grant execute on function public.apply_bounce(uuid, text, uuid, jsonb) to authenticated;

-- 4) Guardrails: block future sends from suppression list
alter table public.send_queue add column if not exists suppressed boolean not null default false;

-- Ensure leads table has bounced column
alter table public.leads add column if not exists bounced boolean not null default false;

create or replace function public.block_suppressed_sends()
returns trigger language plpgsql as $$
declare v_email text; v_acct uuid;
begin
  v_acct := new.account_id;
  -- Try to get email from recipient_email column first, then from leads table
  if new.recipient_email is not null then
    v_email := new.recipient_email;
  elsif new.lead_id is not null then
    select email into v_email from public.leads where id = new.lead_id;
  else
    return new; -- Can't check without email
  end if;
  
  if v_email is not null and exists (
    select 1 from public.suppressions s
    where s.account_id = v_acct and lower(s.email) = lower(v_email)
  ) then
    new.suppressed := true;
    -- Handle both 'state' and 'status' columns
    if exists (select 1 from information_schema.columns where table_name = 'send_queue' and column_name = 'state') then
      new.state := 'canceled';
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'send_queue' and column_name = 'status') then
      new.status := 'canceled';
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_block_suppressed_sends on public.send_queue;
create trigger trg_block_suppressed_sends
before insert on public.send_queue
for each row execute function public.block_suppressed_sends();

-- 5) Glue: mark bounce via Adaptive Reply Brain (fallback)
-- When Brain infers 'bounce', auto-suppress
create or replace function public.auto_suppress_from_brain()
returns trigger language plpgsql as $$
declare v_e record;
begin
  if new.intent = 'bounce' and new.confidence >= 0.70 then
    select e.account_id, e.lead_id, l.email
    into v_e 
    from public.emails e
    left join public.leads l on l.id = e.lead_id
    where e.id = new.email_id;

    if v_e.account_id is not null and v_e.email is not null then
      perform public.apply_bounce(v_e.account_id, v_e.email, v_e.lead_id,
              jsonb_build_object('source','reply_brain','confidence',new.confidence,'output',new.output));
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_auto_suppress_from_brain on public.reply_brain_inferences;
create trigger trg_auto_suppress_from_brain
after insert on public.reply_brain_inferences
for each row execute function public.auto_suppress_from_brain();

