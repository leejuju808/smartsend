-- Block 448 — Sequence Stats v1
-- Per-Step Metrics • Open/Click/Reply Rates • Variant Stats • Benchmarks • Drop-Off Analysis
-- This migration creates aggregation tables and event-based stats updaters for campaign step analytics

-- =====================================================
-- A) Step Stats Table
-- =====================================================

create table if not exists public.campaign_step_stats (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references public.campaign_steps(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  sent int default 0,
  delivered int default 0,
  opened int default 0,
  clicked int default 0,
  replied int default 0,
  bounced int default 0,
  spam int default 0,
  updated_at timestamptz default now(),
  unique(step_id)
);

create index if not exists idx_step_stats_step_id on public.campaign_step_stats(step_id);
create index if not exists idx_step_stats_campaign on public.campaign_step_stats(campaign_id);
create index if not exists idx_step_stats_workspace on public.campaign_step_stats(workspace_id);

-- =====================================================
-- B) Step Variant Stats Table
-- =====================================================

create table if not exists public.campaign_step_variant_stats (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.campaign_step_variants(id) on delete cascade,
  step_id uuid references public.campaign_steps(id) on delete cascade,
  sent int default 0,
  delivered int default 0,
  opened int default 0,
  clicked int default 0,
  replied int default 0,
  bounced int default 0,
  spam int default 0,
  updated_at timestamptz default now(),
  unique(variant_id)
);

create index if not exists idx_variant_stats_variant_id on public.campaign_step_variant_stats(variant_id);
create index if not exists idx_variant_stats_step_id on public.campaign_step_variant_stats(step_id);

-- =====================================================
-- C) Helper Function: Get or Create Step Stats Row
-- =====================================================

create or replace function public.get_or_create_step_stats(
  p_step_id uuid,
  p_campaign_id uuid,
  p_workspace_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats_id uuid;
begin
  -- Try to get existing stats row
  select id into v_stats_id
  from public.campaign_step_stats
  where step_id = p_step_id;
  
  -- If not found, create it
  if v_stats_id is null then
    insert into public.campaign_step_stats (step_id, campaign_id, workspace_id)
    values (p_step_id, p_campaign_id, p_workspace_id)
    returning id into v_stats_id;
  end if;
  
  return v_stats_id;
end;
$$;

-- =====================================================
-- D) Helper Function: Get or Create Variant Stats Row
-- =====================================================

create or replace function public.get_or_create_variant_stats(
  p_variant_id uuid,
  p_step_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats_id uuid;
begin
  -- Try to get existing stats row
  select id into v_stats_id
  from public.campaign_step_variant_stats
  where variant_id = p_variant_id;
  
  -- If not found, create it
  if v_stats_id is null then
    insert into public.campaign_step_variant_stats (variant_id, step_id)
    values (p_variant_id, p_step_id)
    returning id into v_stats_id;
  end if;
  
  return v_stats_id;
end;
$$;

-- =====================================================
-- E) Event-Based Stats Updater Function
-- =====================================================

create or replace function public.update_step_stats_from_event(
  p_step_id uuid,
  p_variant_id uuid default null,
  p_event_type text,
  p_campaign_id uuid default null,
  p_workspace_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_step_id uuid;
begin
  -- Get step_id if we only have step_no
  if p_step_id is null then
    return;
  end if;
  
  v_step_id := p_step_id;
  
  -- Get campaign_id and workspace_id if not provided
  if p_campaign_id is null or p_workspace_id is null then
    select cs.campaign_id, c.workspace_id
    into v_campaign_id, v_workspace_id
    from public.campaign_steps cs
    join public.campaigns c on c.id = cs.campaign_id
    where cs.id = v_step_id;
  else
    v_campaign_id := p_campaign_id;
    v_workspace_id := p_workspace_id;
  end if;
  
  -- Update step stats
  perform public.get_or_create_step_stats(v_step_id, v_campaign_id, v_workspace_id);
  
  -- Update based on event type
  case p_event_type
    when 'sent' then
      update public.campaign_step_stats
      set sent = sent + 1, updated_at = now()
      where step_id = v_step_id;
    when 'delivered' then
      update public.campaign_step_stats
      set delivered = delivered + 1, updated_at = now()
      where step_id = v_step_id;
    when 'opened' then
      update public.campaign_step_stats
      set opened = opened + 1, updated_at = now()
      where step_id = v_step_id;
    when 'clicked' then
      update public.campaign_step_stats
      set clicked = clicked + 1, updated_at = now()
      where step_id = v_step_id;
    when 'replied' then
      update public.campaign_step_stats
      set replied = replied + 1, updated_at = now()
      where step_id = v_step_id;
    when 'bounced' then
      update public.campaign_step_stats
      set bounced = bounced + 1, updated_at = now()
      where step_id = v_step_id;
    when 'spam' then
      update public.campaign_step_stats
      set spam = spam + 1, updated_at = now()
      where step_id = v_step_id;
  end case;
  
  -- Update variant stats if variant_id is provided
  if p_variant_id is not null then
    perform public.get_or_create_variant_stats(p_variant_id, v_step_id);
    
    case p_event_type
      when 'sent' then
        update public.campaign_step_variant_stats
        set sent = sent + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'delivered' then
        update public.campaign_step_variant_stats
        set delivered = delivered + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'opened' then
        update public.campaign_step_variant_stats
        set opened = opened + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'clicked' then
        update public.campaign_step_variant_stats
        set clicked = clicked + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'replied' then
        update public.campaign_step_variant_stats
        set replied = replied + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'bounced' then
        update public.campaign_step_variant_stats
        set bounced = bounced + 1, updated_at = now()
        where variant_id = p_variant_id;
      when 'spam' then
        update public.campaign_step_variant_stats
        set spam = spam + 1, updated_at = now()
        where variant_id = p_variant_id;
    end case;
  end if;
end;
$$;

-- =====================================================
-- F) Trigger Function: Update Stats from Send Logs
-- =====================================================

create or replace function public.tg_update_step_stats_from_send_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step_id uuid;
  v_campaign_id uuid;
  v_workspace_id uuid;
begin
  -- Only process if status changed to 'sent'
  if new.status = 'sent' and (old.status is null or old.status != 'sent') then
    -- Get step_id from campaign_steps using step_no
    if new.step_no is not null and new.campaign_id is not null then
      select cs.id, cs.campaign_id into v_step_id, v_campaign_id
      from public.campaign_steps cs
      where cs.campaign_id = new.campaign_id and cs.step_no = new.step_no
      limit 1;
      
      if v_step_id is not null then
        -- Get workspace_id from campaign
        select workspace_id into v_workspace_id
        from public.campaigns
        where id = v_campaign_id;
        
        -- Update stats
        perform public.update_step_stats_from_event(
          v_step_id,
          new.variant_id,
          'sent',
          v_campaign_id,
          v_workspace_id
        );
      end if;
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger on send_logs
drop trigger if exists trg_update_step_stats_from_send_log on public.send_logs;
create trigger trg_update_step_stats_from_send_log
after insert or update of status on public.send_logs
for each row
execute function public.tg_update_step_stats_from_send_log();

-- =====================================================
-- G) Trigger Function: Update Stats from Delivery Events
-- =====================================================

create or replace function public.tg_update_step_stats_from_delivery_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step_id uuid;
  v_variant_id uuid;
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_step_no int;
begin
  -- Get step info from send_logs
  select sl.step_no, sl.variant_id, sl.campaign_id
  into v_step_no, v_variant_id, v_campaign_id
  from public.send_logs sl
  where sl.id = new.log_id;
  
  if v_step_no is not null and v_campaign_id is not null then
    -- Get step_id
    select id into v_step_id
    from public.campaign_steps
    where campaign_id = v_campaign_id and step_no = v_step_no
    limit 1;
    
    if v_step_id is not null then
      -- Get workspace_id
      select workspace_id into v_workspace_id
      from public.campaigns
      where id = v_campaign_id;
      
      -- Map delivery event kind to event type
      case new.kind
        when 'delivered' then
          perform public.update_step_stats_from_event(
            v_step_id, v_variant_id, 'delivered', v_campaign_id, v_workspace_id
          );
        when 'open' then
          perform public.update_step_stats_from_event(
            v_step_id, v_variant_id, 'opened', v_campaign_id, v_workspace_id
          );
        when 'click' then
          perform public.update_step_stats_from_event(
            v_step_id, v_variant_id, 'clicked', v_campaign_id, v_workspace_id
          );
        when 'bounce' then
          perform public.update_step_stats_from_event(
            v_step_id, v_variant_id, 'bounced', v_campaign_id, v_workspace_id
          );
        when 'spam' then
          perform public.update_step_stats_from_event(
            v_step_id, v_variant_id, 'spam', v_campaign_id, v_workspace_id
          );
      end case;
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger on delivery_events
drop trigger if exists trg_update_step_stats_from_delivery_event on public.delivery_events;
create trigger trg_update_step_stats_from_delivery_event
after insert on public.delivery_events
for each row
execute function public.tg_update_step_stats_from_delivery_event();

-- =====================================================
-- H) Trigger Function: Update Stats from Replies
-- =====================================================

create or replace function public.tg_update_step_stats_from_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step_id uuid;
  v_variant_id uuid;
  v_campaign_id uuid;
  v_workspace_id uuid;
  v_step_no int;
begin
  -- Only process human replies
  if not public.is_human_reply(new.ai_label) then
    return new;
  end if;
  
  -- Find the most recent send_log for this lead/campaign
  select sl.step_no, sl.variant_id, sl.campaign_id
  into v_step_no, v_variant_id, v_campaign_id
  from public.send_logs sl
  join public.inbox_threads t on t.id = new.thread_id
  where sl.lead_id = t.lead_id
    and sl.campaign_id = t.campaign_id
    and sl.status = 'sent'
    and sl.sent_at < new.created_at
  order by sl.sent_at desc
  limit 1;
  
  if v_step_no is not null and v_campaign_id is not null then
    -- Get step_id
    select id into v_step_id
    from public.campaign_steps
    where campaign_id = v_campaign_id and step_no = v_step_no
    limit 1;
    
    if v_step_id is not null then
      -- Get workspace_id
      select workspace_id into v_workspace_id
      from public.campaigns
      where id = v_campaign_id;
      
      -- Update reply stats
      perform public.update_step_stats_from_event(
        v_step_id, v_variant_id, 'replied', v_campaign_id, v_workspace_id
      );
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger on inbox_messages for replies
drop trigger if exists trg_update_step_stats_from_reply on public.inbox_messages;
create trigger trg_update_step_stats_from_reply
after insert on public.inbox_messages
for each row
when (new.direction in ('inbound', 'in') and public.is_human_reply(new.ai_label))
execute function public.tg_update_step_stats_from_reply();

-- =====================================================
-- I) RPC Functions: Get Step Stats
-- =====================================================

create or replace function public.get_step_stats(p_step_id uuid)
returns table (
  step_id uuid,
  sent int,
  delivered int,
  opened int,
  clicked int,
  replied int,
  bounced int,
  spam int,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric,
  bounce_rate numeric,
  spam_rate numeric,
  delivery_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.step_id,
    s.sent,
    s.delivered,
    s.opened,
    s.clicked,
    s.replied,
    s.bounced,
    s.spam,
    case when s.sent > 0 then round(100.0 * s.opened / s.sent, 2) else 0 end as open_rate,
    case when s.sent > 0 then round(100.0 * s.clicked / s.sent, 2) else 0 end as click_rate,
    case when s.sent > 0 then round(100.0 * s.replied / s.sent, 2) else 0 end as reply_rate,
    case when s.sent > 0 then round(100.0 * s.bounced / s.sent, 2) else 0 end as bounce_rate,
    case when s.sent > 0 then round(100.0 * s.spam / s.sent, 2) else 0 end as spam_rate,
    case when s.sent > 0 then round(100.0 * s.delivered / s.sent, 2) else 0 end as delivery_rate
  from public.campaign_step_stats s
  where s.step_id = p_step_id;
$$;

-- =====================================================
-- J) RPC Functions: Get Variant Stats
-- =====================================================

create or replace function public.get_variant_stats(p_variant_id uuid)
returns table (
  variant_id uuid,
  sent int,
  delivered int,
  opened int,
  clicked int,
  replied int,
  bounced int,
  spam int,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric,
  bounce_rate numeric,
  spam_rate numeric,
  delivery_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.variant_id,
    v.sent,
    v.delivered,
    v.opened,
    v.clicked,
    v.replied,
    v.bounced,
    v.spam,
    case when v.sent > 0 then round(100.0 * v.opened / v.sent, 2) else 0 end as open_rate,
    case when v.sent > 0 then round(100.0 * v.clicked / v.sent, 2) else 0 end as click_rate,
    case when v.sent > 0 then round(100.0 * v.replied / v.sent, 2) else 0 end as reply_rate,
    case when v.sent > 0 then round(100.0 * v.bounced / v.sent, 2) else 0 end as bounce_rate,
    case when v.sent > 0 then round(100.0 * v.spam / v.sent, 2) else 0 end as spam_rate,
    case when v.sent > 0 then round(100.0 * v.delivered / v.sent, 2) else 0 end as delivery_rate
  from public.campaign_step_variant_stats v
  where v.variant_id = p_variant_id;
$$;

-- =====================================================
-- K) RPC Functions: Get Campaign Step Stats (All Steps)
-- =====================================================

create or replace function public.get_campaign_step_stats(p_campaign_id uuid)
returns table (
  step_id uuid,
  step_no int,
  step_name text,
  sent int,
  delivered int,
  opened int,
  clicked int,
  replied int,
  bounced int,
  spam int,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric,
  bounce_rate numeric,
  spam_rate numeric,
  delivery_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cs.id as step_id,
    cs.step_no,
    coalesce(cs.name, 'Step ' || cs.step_no::text) as step_name,
    coalesce(s.sent, 0) as sent,
    coalesce(s.delivered, 0) as delivered,
    coalesce(s.opened, 0) as opened,
    coalesce(s.clicked, 0) as clicked,
    coalesce(s.replied, 0) as replied,
    coalesce(s.bounced, 0) as bounced,
    coalesce(s.spam, 0) as spam,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.opened, 0) / s.sent, 2) else 0 end as open_rate,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.clicked, 0) / s.sent, 2) else 0 end as click_rate,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.replied, 0) / s.sent, 2) else 0 end as reply_rate,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.bounced, 0) / s.sent, 2) else 0 end as bounce_rate,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.spam, 0) / s.sent, 2) else 0 end as spam_rate,
    case when coalesce(s.sent, 0) > 0 then round(100.0 * coalesce(s.delivered, 0) / s.sent, 2) else 0 end as delivery_rate
  from public.campaign_steps cs
  left join public.campaign_step_stats s on s.step_id = cs.id
  where cs.campaign_id = p_campaign_id
  order by cs.step_no;
$$;

-- =====================================================
-- L) RLS Policies
-- =====================================================

alter table public.campaign_step_stats enable row level security;
alter table public.campaign_step_variant_stats enable row level security;

-- Step stats: users can read stats for campaigns in their workspace
drop policy if exists "step_stats_select_workspace" on public.campaign_step_stats;
create policy "step_stats_select_workspace" on public.campaign_step_stats
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_step_stats.campaign_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- Variant stats: users can read stats for variants in their workspace
drop policy if exists "variant_stats_select_workspace" on public.campaign_step_variant_stats;
create policy "variant_stats_select_workspace" on public.campaign_step_variant_stats
  for select using (
    exists (
      select 1 from public.campaign_step_variants csv
      join public.campaigns c on c.id = csv.campaign_id
      where csv.id = campaign_step_variant_stats.variant_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- Service role can manage all stats
drop policy if exists "step_stats_service_role" on public.campaign_step_stats;
create policy "step_stats_service_role" on public.campaign_step_stats
  for all using (auth.role() = 'service_role');

drop policy if exists "variant_stats_service_role" on public.campaign_step_variant_stats;
create policy "variant_stats_service_role" on public.campaign_step_variant_stats
  for all using (auth.role() = 'service_role');

