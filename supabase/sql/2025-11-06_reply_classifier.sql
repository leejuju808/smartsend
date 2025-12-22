-- Reply classifier schema, helpers, and audit trail
-- Run in Supabase SQL

-- A) Canonical label sets (workspace-level override-able)
create table if not exists public.reply_label_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default',
  labels text[] not null default array[
    'positive','meeting','referral','neutral','not_interested','ooo','bounce','other'
  ],
  unique(owner_id, name)
);

-- B) Per-campaign classifier config (thresholds + actions)
create table if not exists public.campaign_reply_config (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  label_set_id uuid references public.reply_label_sets(id) on delete set null,
  threshold_positive numeric not null default 0.55,
  threshold_meeting numeric not null default 0.55,
  threshold_referral numeric not null default 0.55,
  threshold_not_interested numeric not null default 0.6,
  threshold_ooo numeric not null default 0.6,
  threshold_bounce numeric not null default 0.7,
  auto_pause_on_negative boolean not null default true,
  auto_mark_replied boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public._touch_campaign_reply_config()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_campaign_reply_config on public.campaign_reply_config;
create trigger trg_touch_campaign_reply_config
before update on public.campaign_reply_config
for each row execute function public._touch_campaign_reply_config();

-- C) Audit table for model outputs
create table if not exists public.reply_classify_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  model text not null,
  probs jsonb not null,
  top_label text not null,
  applied_label text,
  thresholds jsonb not null,
  prompt_tokens int,
  completion_tokens int,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_reply_audit_campaign on public.reply_classify_audit(campaign_id, created_at desc);
create index if not exists idx_reply_audit_thread on public.reply_classify_audit(thread_id, created_at desc);

-- D) Store final label on messages (ensure column + index)
alter table public.inbox_messages
  add column if not exists ai_label text;

create index if not exists idx_inbox_ai_label on public.inbox_messages(ai_label);

-- E) Helper to pick applied label using thresholds (per-campaign)
drop function if exists public.apply_reply_thresholds(uuid, jsonb, text);
create or replace function public.apply_reply_thresholds(
  p_campaign uuid,
  p_probs jsonb,
  p_top text
) returns text
language plpgsql
stable
as $$
declare
  cfg public.campaign_reply_config%rowtype;
  p numeric;
  win text := coalesce(p_top, 'other');
begin
  select * into cfg from public.campaign_reply_config where campaign_id = p_campaign;

  if not found then
    return win;
  end if;

  p := (p_probs->>'positive')::numeric; if p is not null and p >= cfg.threshold_positive then return 'positive'; end if;
  p := (p_probs->>'meeting')::numeric; if p is not null and p >= cfg.threshold_meeting then return 'meeting'; end if;
  p := (p_probs->>'referral')::numeric; if p is not null and p >= cfg.threshold_referral then return 'referral'; end if;

  p := (p_probs->>'not_interested')::numeric; if p is not null and p >= cfg.threshold_not_interested then return 'not_interested'; end if;
  p := (p_probs->>'ooo')::numeric; if p is not null and p >= cfg.threshold_ooo then return 'ooo'; end if;
  p := (p_probs->>'bounce')::numeric; if p is not null and p >= cfg.threshold_bounce then return 'bounce'; end if;

  return coalesce(p_top, 'other');
end;
$$;

-- F) Side-effect RPC: commit label + auto-actions
drop function if exists public.commit_reply_label(uuid, uuid, uuid, text, jsonb, text, text);
create or replace function public.commit_reply_label(
  p_campaign uuid,
  p_thread uuid,
  p_message uuid,
  p_model text,
  p_probs jsonb,
  p_top text,
  p_applied text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.campaign_reply_config%rowtype;
  v_lead uuid;
begin
  update public.inbox_messages
     set ai_label = p_applied
   where id = p_message;

  select * into cfg from public.campaign_reply_config where campaign_id = p_campaign;

  insert into public.reply_classify_audit(
    campaign_id,
    thread_id,
    message_id,
    model,
    probs,
    top_label,
    applied_label,
    thresholds,
    prompt_tokens,
    completion_tokens,
    meta
  )
  values (
    p_campaign,
    p_thread,
    p_message,
    p_model,
    p_probs,
    p_top,
    p_applied,
    coalesce(to_jsonb(cfg), '{}'::jsonb),
    null,
    null,
    '{}'::jsonb
  );

  select lead_id into v_lead from public.inbox_threads where id = p_thread;

  if p_applied in ('positive','meeting','referral') then
    if coalesce(cfg.auto_mark_replied, true) then
      update public.inbox_threads
         set replied_at = coalesce(replied_at, now()),
             updated_at = now()
       where id = p_thread;

      if v_lead is not null then
        update public.campaign_leads
           set status = 'replied'
         where campaign_id = p_campaign and lead_id = v_lead;
      end if;
    end if;
  elsif p_applied in ('not_interested','bounce') then
    if coalesce(cfg.auto_pause_on_negative, true) and v_lead is not null then
      update public.campaign_leads
         set status = case when p_applied = 'bounce' then 'bounced' else 'paused' end
       where campaign_id = p_campaign and lead_id = v_lead;
    end if;
  end if;
end;
$$;

revoke all on function public.commit_reply_label(uuid, uuid, uuid, text, jsonb, text, text) from public;
grant execute on function public.commit_reply_label(uuid, uuid, uuid, text, jsonb, text, text) to service_role;





