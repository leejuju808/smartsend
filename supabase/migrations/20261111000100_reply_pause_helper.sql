-- Reply detection + pause helper setup (idempotent)

-- Ensure delivery_events supports reply detection events and step linkage
alter table public.delivery_events
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null;

alter table public.delivery_events
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null;

alter table public.delivery_events
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.delivery_events
  add column if not exists lead_id uuid references public.leads(id) on delete cascade;

alter table public.delivery_events
  add column if not exists meta jsonb not null default '{}'::jsonb;

do $$
begin
  -- Normalize kind constraint (legacy versions of the table use kind)
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'delivery_events'
       and column_name  = 'kind'
  ) then
    execute 'alter table public.delivery_events drop constraint if exists delivery_events_kind_check';
    execute $ddl$
      alter table public.delivery_events
        add constraint delivery_events_kind_check
        check (
          kind in (
            'sent','delivered','open','opened','click','clicked','bounce','bounced',
            'spam','unsubscribe','complaint','reply_detected','ooo_detected',
            'unsubscribe_detected','manual_pause'
          )
        )
    $ddl$;
  end if;

  -- Normalize event constraint if the column exists
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'delivery_events'
       and column_name  = 'event'
  ) then
    execute 'alter table public.delivery_events drop constraint if exists delivery_events_event_check';
    execute $ddl$
      alter table public.delivery_events
        add constraint delivery_events_event_check
        check (
          event in (
            'sent','delivered','opened','clicked','bounced',
            'reply_detected','ooo_detected','unsubscribe_detected','manual_pause'
          )
        )
    $ddl$;
  end if;
end;
$$;

create index if not exists idx_delivery_events_lead on public.delivery_events(lead_id);
create index if not exists idx_delivery_events_campaign on public.delivery_events(campaign_id);

-- Reply detections table enrichments
alter table public.reply_detections
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists classifier text not null default 'rule',
  add column if not exists intent text default 'unknown',
  add column if not exists confidence real not null default 0.6,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

update public.reply_detections
   set intent = coalesce(intent, 'unknown')
 where intent is null;

alter table public.reply_detections
  alter column intent set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'reply_detections_intent_check'
       and conrelid = 'public.reply_detections'::regclass
  ) then
    execute $ddl$
      alter table public.reply_detections
        add constraint reply_detections_intent_check
        check (
          intent in (
            'ooo','unsubscribe','positive','negative','question','routing','neutral','unknown'
          )
        )
    $ddl$;
  end if;
end;
$$;

create index if not exists idx_reply_detections_lead on public.reply_detections(lead_id, created_at desc);

-- Follow-up task timestamp helpers
alter table public.followup_tasks
  add column if not exists sent_at timestamptz,
  add column if not exists canceled_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'followup_tasks'
       and column_name  = 'send_after'
  ) then
    execute 'alter table public.followup_tasks add column send_after timestamptz generated always as (due_at) stored';
  end if;
exception
  when feature_not_supported then
    -- Fallback for environments that do not yet support generated columns
    if not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'followup_tasks'
         and column_name  = 'send_after'
    ) then
      alter table public.followup_tasks add column send_after timestamptz;
      update public.followup_tasks set send_after = due_at where send_after is null;
    end if;
end;
$$;

-- Maintain send_after mirror if we had to fall back to a writable column
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'followup_tasks'
       and column_name  = 'send_after'
       and is_generated = 'NEVER'
  ) then
    update public.followup_tasks set send_after = due_at where send_after is distinct from due_at;
  end if;
end;
$$;

create index if not exists idx_followups_lead_future
  on public.followup_tasks(lead_id, due_at)
  where status in ('pending','processing') and canceled_at is null;

-- Campaign lead pause metadata
alter table public.campaign_leads
  add column if not exists paused_until timestamptz,
  add column if not exists paused_reason text;

create index if not exists idx_campaign_leads_paused
  on public.campaign_leads(campaign_id, paused_until)
  where paused_until is not null;

-- Helper to pause future follow-ups when a reply is detected
create or replace function public.pause_followups_on_reply(
  p_campaign uuid,
  p_lead uuid,
  p_reason text,
  p_days int default 30
) returns void
language plpgsql
as $$
declare
  v_pause_until timestamptz := case
    when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days)
    else now()
  end;
begin
  if p_campaign is null or p_lead is null then
    return;
  end if;

  update public.followup_tasks
     set status = 'canceled',
         canceled_at = now(),
         error = coalesce(nullif(error, ''), p_reason)
   where campaign_id = p_campaign
     and lead_id = p_lead
     and status in ('pending','processing')
     and (canceled_at is null)
     and due_at > now();

  update public.campaign_leads
     set paused_until = v_pause_until,
         paused_reason = p_reason
   where campaign_id = p_campaign
     and lead_id = p_lead;

  update public.inbox_threads
     set updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead;
end;
$$;

-- RLS: ensure reply_detections is readable while inserts go through service role
alter table public.reply_detections enable row level security;

create policy if not exists "read_reply_detections"
  on public.reply_detections
  for select
  to authenticated
  using (public.is_campaign_viewer(campaign_id));

create policy if not exists "insert_reply_detections_service"
  on public.reply_detections
  for insert
  to service_role
  with check (true);

-- Delivery events RLS: allow authenticated reads, service writes
alter table public.delivery_events enable row level security;

create policy if not exists "read_delivery_events"
  on public.delivery_events
  for select
  to authenticated
  using (public.is_campaign_viewer(campaign_id));

create policy if not exists "insert_delivery_events_service"
  on public.delivery_events
  for insert
  to service_role
  with check (true);

