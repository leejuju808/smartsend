-- Block 450 — Broadcasts v1
-- One-Off Email Blasts • Segment-Based Sends • Throttling • Stats • Team Permissions
-- Transforms SmartSend from "sequences only" to full cold email operating system

-- ============================================================================
-- 1️⃣ SUPABASE SCHEMA — Broadcasts Tables
-- ============================================================================

-- A) Broadcasts Table
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  segment_id uuid references public.segments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'completed', 'paused')),
  scheduled_at timestamptz,
  throttle_per_minute int not null default 30 check (throttle_per_minute > 0),
  sender_inbox_ids uuid[] default '{}'::uuid[], -- Optional: specific inboxes, empty = rotation
  rotation_domain_id uuid references public.sender_domains(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_broadcasts_workspace on public.broadcasts(workspace_id);
create index if not exists idx_broadcasts_status on public.broadcasts(status, scheduled_at);
create index if not exists idx_broadcasts_segment on public.broadcasts(segment_id);
create index if not exists idx_broadcasts_created_by on public.broadcasts(created_by);
create index if not exists idx_broadcasts_created_at on public.broadcasts(created_at desc);

-- B) Broadcast Recipients Table
create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  sent boolean default false,
  sent_at timestamptz,
  delivered boolean default false,
  delivered_at timestamptz,
  opened boolean default false,
  opened_at timestamptz,
  clicked boolean default false,
  clicked_at timestamptz,
  replied boolean default false,
  replied_at timestamptz,
  bounced boolean default false,
  bounced_at timestamptz,
  spam boolean default false,
  spam_at timestamptz,
  unsubscribe boolean default false,
  unsubscribe_at timestamptz,
  queue_id text, -- Can reference send_queue(id) or send_queue_optimized(id)
  created_at timestamptz default now(),
  unique (broadcast_id, lead_id)
);

create index if not exists idx_broadcast_recipients_broadcast on public.broadcast_recipients(broadcast_id);
create index if not exists idx_broadcast_recipients_lead on public.broadcast_recipients(lead_id);
create index if not exists idx_broadcast_recipients_sent on public.broadcast_recipients(broadcast_id, sent);
create index if not exists idx_broadcast_recipients_inbox on public.broadcast_recipients(inbox_id);
create index if not exists idx_broadcast_recipients_queue on public.broadcast_recipients(queue_id);

-- ============================================================================
-- 2️⃣ UPDATE TRIGGERS
-- ============================================================================

create trigger trg_broadcasts_updated_at
before update on public.broadcasts
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 3️⃣ ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

-- Broadcasts: Workspace members can read, create/update based on permissions
create policy "broadcasts_select"
on public.broadcasts
for select
using (
  workspace_id IN (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "broadcasts_insert"
on public.broadcasts
for insert
with check (
  workspace_id IN (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "broadcasts_update"
on public.broadcasts
for update
using (
  workspace_id IN (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
  AND (
    -- Owner/Admin can always update
    EXISTS (
      select 1 from public.workspace_members wm
      where wm.workspace_id = broadcasts.workspace_id
        and wm.user_id = auth.uid()
        and wm.role IN ('owner', 'admin')
    )
    OR
    -- Members can update if permissions enabled
    (
      EXISTS (
        select 1 from public.workspace_members wm
        where wm.workspace_id = broadcasts.workspace_id
          and wm.user_id = auth.uid()
          and wm.role = 'member'
      )
      AND EXISTS (
        select 1 from public.workspaces w
        where w.id = broadcasts.workspace_id
          and (w.settings->>'members_can_send_broadcasts')::boolean = true
      )
    )
  )
);

create policy "broadcasts_delete"
on public.broadcasts
for delete
using (
  workspace_id IN (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
    and role IN ('owner', 'admin')
  )
);

-- Broadcast Recipients: Same workspace access
create policy "broadcast_recipients_select"
on public.broadcast_recipients
for select
using (
  EXISTS (
    select 1 from public.broadcasts b
    where b.id = broadcast_recipients.broadcast_id
      and b.workspace_id IN (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
  )
);

create policy "broadcast_recipients_insert"
on public.broadcast_recipients
for insert
with check (
  EXISTS (
    select 1 from public.broadcasts b
    where b.id = broadcast_recipients.broadcast_id
      and b.workspace_id IN (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
  )
);

create policy "broadcast_recipients_update"
on public.broadcast_recipients
for update
using (
  EXISTS (
    select 1 from public.broadcasts b
    where b.id = broadcast_recipients.broadcast_id
      and b.workspace_id IN (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
  )
);

-- ============================================================================
-- 4️⃣ BROADCAST SENDING FUNCTION
-- ============================================================================

-- Function: Prepare broadcast for sending (loads segment leads, creates recipients)
create or replace function public.prepare_broadcast_send(
  p_broadcast_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast record;
  v_workspace_id uuid;
  v_segment_id uuid;
  v_lead_count int;
  v_recipient_count int;
  v_leads uuid[];
begin
  -- Get broadcast details
  select * into v_broadcast
  from public.broadcasts
  where id = p_broadcast_id;
  
  if not found then
    return jsonb_build_object('error', 'Broadcast not found');
  end if;
  
  v_workspace_id := v_broadcast.workspace_id;
  v_segment_id := v_broadcast.segment_id;
  
  -- Step A: Load segment leads (excluding suppressed emails)
  -- Check which segment_members table exists
  if v_segment_id is null then
    return jsonb_build_object('error', 'Broadcast must have a segment');
  end if;
  
  -- Get leads from segment, excluding suppressed emails
  select array_agg(l.id)
  into v_leads
  from public.leads l
  where l.workspace_id = v_workspace_id
    and l.id IN (
      select lead_id 
      from public.lead_segment_members 
      where segment_id = v_segment_id
    )
    and l.email NOT IN (
      select email 
      from public.email_suppression 
      where workspace_id = v_workspace_id
    )
    and coalesce(l.bounced, false) = false
    and coalesce(l.unsubscribed, false) = false;
  
  v_lead_count := coalesce(array_length(v_leads, 1), 0);
  
  if v_lead_count = 0 then
    return jsonb_build_object('error', 'No eligible leads found in segment');
  end if;
  
  -- Step B: Insert recipients (ignore duplicates)
  insert into public.broadcast_recipients (broadcast_id, lead_id)
  select p_broadcast_id, unnest(v_leads)
  on conflict (broadcast_id, lead_id) do nothing;
  
  get diagnostics v_recipient_count = row_count;
  
  -- Update broadcast status
  update public.broadcasts
  set status = 'sending',
      started_at = now()
  where id = p_broadcast_id;
  
  return jsonb_build_object(
    'success', true,
    'broadcast_id', p_broadcast_id,
    'leads_found', v_lead_count,
    'recipients_created', v_recipient_count
  );
end;
$$;

-- Function: Queue broadcast emails for sending
create or replace function public.queue_broadcast_emails(
  p_broadcast_id uuid,
  p_batch_size int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast record;
  v_workspace_id uuid;
  v_recipient record;
  v_inbox_id uuid;
  v_queued_count int := 0;
  v_lead record;
  v_subject text;
  v_body text;
  v_personalized_subject text;
  v_personalized_body text;
  v_scheduled_at timestamptz;
  v_throttle_per_min int;
  v_interval_seconds numeric;
  v_batch_start timestamptz;
begin
  -- Get broadcast details
  select * into v_broadcast
  from public.broadcasts
  where id = p_broadcast_id;
  
  if not found then
    return jsonb_build_object('error', 'Broadcast not found');
  end if;
  
  if v_broadcast.status != 'sending' then
    return jsonb_build_object('error', 'Broadcast is not in sending status');
  end if;
  
  v_workspace_id := v_broadcast.workspace_id;
  v_throttle_per_min := v_broadcast.throttle_per_minute;
  v_interval_seconds := 60.0 / v_throttle_per_min;
  v_batch_start := now();
  
  -- Process recipients in batches
  for v_recipient in
    select br.*, l.email, l.first_name, l.last_name, l.company
    from public.broadcast_recipients br
    join public.leads l on l.id = br.lead_id
    where br.broadcast_id = p_broadcast_id
      and br.sent = false
      and br.queue_id is null
    limit p_batch_size
  loop
    -- Personalize subject and body
    v_subject := v_broadcast.subject;
    v_body := v_broadcast.body;
    
    -- Simple personalization (replace {{first_name}}, {{last_name}}, {{company}}, {{email}})
    v_personalized_subject := v_subject;
    v_personalized_body := v_body;
    
    if v_recipient.first_name is not null then
      v_personalized_subject := replace(v_personalized_subject, '{{first_name}}', v_recipient.first_name);
      v_personalized_body := replace(v_personalized_body, '{{first_name}}', v_recipient.first_name);
    end if;
    
    if v_recipient.last_name is not null then
      v_personalized_subject := replace(v_personalized_subject, '{{last_name}}', v_recipient.last_name);
      v_personalized_body := replace(v_personalized_body, '{{last_name}}', v_recipient.last_name);
    end if;
    
    if v_recipient.company is not null then
      v_personalized_subject := replace(v_personalized_subject, '{{company}}', v_recipient.company);
      v_personalized_body := replace(v_personalized_body, '{{company}}', v_recipient.company);
    end if;
    
    v_personalized_subject := replace(v_personalized_subject, '{{email}}', v_recipient.email);
    v_personalized_body := replace(v_personalized_body, '{{email}}', v_recipient.email);
    
    -- Step C: Use rotation engine for inboxes
    if array_length(v_broadcast.sender_inbox_ids, 1) > 0 then
      -- Use specific inboxes (round-robin or pick based on health)
      select id into v_inbox_id
      from unnest(v_broadcast.sender_inbox_ids) as inbox_id
      join public.sender_inboxes si on si.id = inbox_id
      where si.workspace_id = v_workspace_id
        and si.connected = true
      limit 1;
    elsif v_broadcast.rotation_domain_id is not null then
      -- Use rotation engine (check if function supports user_id parameter)
      begin
        select public.pick_rotation_inbox(
          v_broadcast.rotation_domain_id,
          v_broadcast.created_by,
          date_trunc('day', now())
        ) into v_inbox_id;
      exception when others then
        -- Fallback: try without user_id parameter
        select public.pick_rotation_inbox(
          v_broadcast.rotation_domain_id,
          date_trunc('day', now())
        ) into v_inbox_id;
      end;
    else
      -- Default: pick any connected inbox in workspace
      select id into v_inbox_id
      from public.sender_inboxes
      where workspace_id = v_workspace_id
        and connected = true
      limit 1;
    end if;
    
    -- Calculate scheduled time based on throttle
    v_scheduled_at := v_batch_start + (v_queued_count * v_interval_seconds || ' seconds')::interval;
    
    -- Step D: Insert into send_queue with type: "broadcast"
    -- Try to use send_queue_optimized if it exists, otherwise use send_queue
    begin
      -- Check if send_queue_optimized exists and has required columns
      if exists (
        select 1 from information_schema.tables 
        where table_schema = 'public' and table_name = 'send_queue_optimized'
      ) then
        -- Use send_queue_optimized
        insert into public.send_queue_optimized (
          workspace_id,
          type,
          data,
          status,
          scheduled_for,
          priority
        )
        values (
          v_workspace_id,
          'broadcast',
          jsonb_build_object(
            'broadcast_id', p_broadcast_id,
            'lead_id', v_recipient.lead_id,
            'to_email', v_recipient.email,
            'subject', v_personalized_subject,
            'body_html', v_personalized_body,
            'body_text', v_personalized_body,
            'sender_inbox_id', v_inbox_id
          ),
          'pending',
          v_scheduled_at,
          100
        )
        returning id::text into v_recipient.queue_id;
      else
        -- Use standard send_queue - add columns if needed
        -- Add workspace_id if not exists
        if not exists (
          select 1 from information_schema.columns 
          where table_schema = 'public' and table_name = 'send_queue' and column_name = 'workspace_id'
        ) then
          alter table public.send_queue add column workspace_id uuid;
        end if;
        
        -- Add type column if not exists
        if not exists (
          select 1 from information_schema.columns 
          where table_schema = 'public' and table_name = 'send_queue' and column_name = 'type'
        ) then
          alter table public.send_queue add column type text;
        end if;
        
        -- Add metadata column if not exists
        if not exists (
          select 1 from information_schema.columns 
          where table_schema = 'public' and table_name = 'send_queue' and column_name = 'metadata'
        ) then
          alter table public.send_queue add column metadata jsonb;
        end if;
        
        -- Add sender_inbox_id if not exists
        if not exists (
          select 1 from information_schema.columns 
          where table_schema = 'public' and table_name = 'send_queue' and column_name = 'sender_inbox_id'
        ) then
          alter table public.send_queue add column sender_inbox_id uuid references public.sender_inboxes(id);
        end if;
        
        -- Insert into send_queue
        insert into public.send_queue (
          workspace_id,
          lead_id,
          to_email,
          subject,
          body_html,
          body_text,
          sender_inbox_id,
          scheduled_at,
          status,
          type,
          metadata
        )
        values (
          v_workspace_id,
          v_recipient.lead_id,
          v_recipient.email,
          v_personalized_subject,
          v_personalized_body,
          v_personalized_body,
          v_inbox_id,
          v_scheduled_at,
          'pending',
          'broadcast',
          jsonb_build_object('broadcast_id', p_broadcast_id)
        )
        returning id::text into v_recipient.queue_id;
      end if;
    exception when others then
      -- Fallback: try minimal insert
      insert into public.send_queue (
        lead_id,
        subject,
        body,
        scheduled_at,
        status
      )
      values (
        v_recipient.lead_id,
        v_personalized_subject,
        v_personalized_body,
        v_scheduled_at,
        'queued'
      )
      returning id::text into v_recipient.queue_id;
    end;
    
    -- Update recipient with queue_id (handle both text and bigint queue_ids)
    if v_recipient.queue_id is not null then
      update public.broadcast_recipients
      set queue_id = v_recipient.queue_id::text,
          inbox_id = v_inbox_id
      where id = v_recipient.id;
    end if;
    
    v_queued_count := v_queued_count + 1;
  end loop;
  
  -- Check if all recipients are queued
  if not exists (
    select 1 from public.broadcast_recipients
    where broadcast_id = p_broadcast_id
      and sent = false
      and queue_id is null
  ) then
    -- All recipients queued, broadcast can be marked as completed when all sent
    -- (Status will be updated by send queue processor)
  end if;
  
  return jsonb_build_object(
    'success', true,
    'queued', v_queued_count
  );
end;
$$;

-- ============================================================================
-- 5️⃣ BROADCAST ANALYTICS VIEWS
-- ============================================================================

-- View: Broadcast Stats Summary
create or replace view public.v_broadcast_stats as
select
  b.id as broadcast_id,
  b.workspace_id,
  b.name,
  b.status,
  b.created_at,
  b.started_at,
  b.completed_at,
  count(br.id) as total_recipients,
  count(br.id) filter (where br.sent = true) as sent_count,
  count(br.id) filter (where br.delivered = true) as delivered_count,
  count(br.id) filter (where br.opened = true) as opened_count,
  count(br.id) filter (where br.clicked = true) as clicked_count,
  count(br.id) filter (where br.replied = true) as replied_count,
  count(br.id) filter (where br.bounced = true) as bounced_count,
  count(br.id) filter (where br.spam = true) as spam_count,
  count(br.id) filter (where br.unsubscribe = true) as unsubscribe_count,
  case 
    when count(br.id) filter (where br.sent = true) > 0 
    then round(
      (count(br.id) filter (where br.delivered = true)::numeric / 
       count(br.id) filter (where br.sent = true)::numeric) * 100, 
      2
    )
    else 0
  end as delivery_rate,
  case 
    when count(br.id) filter (where br.delivered = true) > 0 
    then round(
      (count(br.id) filter (where br.opened = true)::numeric / 
       count(br.id) filter (where br.delivered = true)::numeric) * 100, 
      2
    )
    else 0
  end as open_rate,
  case 
    when count(br.id) filter (where br.delivered = true) > 0 
    then round(
      (count(br.id) filter (where br.clicked = true)::numeric / 
       count(br.id) filter (where br.delivered = true)::numeric) * 100, 
      2
    )
    else 0
  end as click_rate,
  case 
    when count(br.id) filter (where br.delivered = true) > 0 
    then round(
      (count(br.id) filter (where br.replied = true)::numeric / 
       count(br.id) filter (where br.delivered = true)::numeric) * 100, 
      2
    )
    else 0
  end as reply_rate
from public.broadcasts b
left join public.broadcast_recipients br on br.broadcast_id = b.id
group by b.id, b.workspace_id, b.name, b.status, b.created_at, b.started_at, b.completed_at;

-- View: Broadcast Stats by Inbox
create or replace view public.v_broadcast_stats_by_inbox as
select
  b.id as broadcast_id,
  br.inbox_id,
  si.email as inbox_email,
  count(br.id) as sent_count,
  count(br.id) filter (where br.delivered = true) as delivered_count,
  count(br.id) filter (where br.opened = true) as opened_count,
  count(br.id) filter (where br.clicked = true) as clicked_count,
  count(br.id) filter (where br.replied = true) as replied_count,
  case 
    when count(br.id) filter (where br.delivered = true) > 0 
    then round(
      (count(br.id) filter (where br.opened = true)::numeric / 
       count(br.id) filter (where br.delivered = true)::numeric) * 100, 
      2
    )
    else 0
  end as open_rate
from public.broadcasts b
join public.broadcast_recipients br on br.broadcast_id = b.id
left join public.sender_inboxes si on si.id = br.inbox_id
where br.sent = true
group by b.id, br.inbox_id, si.email;

-- ============================================================================
-- 6️⃣ HELPER FUNCTIONS FOR TRACKING
-- ============================================================================

-- Function: Update broadcast recipient on email event
create or replace function public.update_broadcast_recipient_event(
  p_queue_id text,
  p_event_type text,
  p_event_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_recipient_id uuid;
  v_queue_type text;
begin
  -- Try to get broadcast_id from send_queue_optimized first
  begin
    select data->>'broadcast_id' into v_broadcast_id
    from public.send_queue_optimized
    where id::text = p_queue_id::text;
    
    if v_broadcast_id is not null then
      -- Found in send_queue_optimized
      select id into v_recipient_id
      from public.broadcast_recipients
      where broadcast_id = (v_broadcast_id::uuid)
        and queue_id::text = p_queue_id::text;
      
      if v_recipient_id is null then
        -- Try to find by lead_id from data
        select br.id into v_recipient_id
        from public.broadcast_recipients br
        join public.send_queue_optimized sq on sq.data->>'lead_id' = br.lead_id::text
        where sq.id::text = p_queue_id::text
          and br.broadcast_id = (v_broadcast_id::uuid)
        limit 1;
      end if;
      
      if v_recipient_id is not null then
        -- Update recipient based on event type
        case p_event_type
          when 'sent' then
            update public.broadcast_recipients
            set sent = true, sent_at = p_event_at
            where id = v_recipient_id;
          when 'delivered' then
            update public.broadcast_recipients
            set delivered = true, delivered_at = p_event_at
            where id = v_recipient_id;
          when 'opened' then
            update public.broadcast_recipients
            set opened = true, opened_at = p_event_at
            where id = v_recipient_id;
          when 'clicked' then
            update public.broadcast_recipients
            set clicked = true, clicked_at = p_event_at
            where id = v_recipient_id;
          when 'replied' then
            update public.broadcast_recipients
            set replied = true, replied_at = p_event_at
            where id = v_recipient_id;
          when 'bounced' then
            update public.broadcast_recipients
            set bounced = true, bounced_at = p_event_at
            where id = v_recipient_id;
          when 'spam' then
            update public.broadcast_recipients
            set spam = true, spam_at = p_event_at
            where id = v_recipient_id;
          when 'unsubscribe' then
            update public.broadcast_recipients
            set unsubscribe = true, unsubscribe_at = p_event_at
            where id = v_recipient_id;
        end case;
        
        -- Check completion
        select id into v_broadcast_id from public.broadcast_recipients where id = v_recipient_id;
        if v_broadcast_id is not null then
          if not exists (
            select 1 from public.broadcast_recipients br
            join public.send_queue_optimized sq on sq.id::text = br.queue_id::text
            where br.broadcast_id = v_broadcast_id
              and sq.status IN ('pending', 'queued', 'processing')
          ) then
            update public.broadcasts
            set status = 'completed',
                completed_at = now()
            where id = v_broadcast_id
              and status = 'sending';
          end if;
        end if;
        
        return;
      end if;
    end if;
  exception when others then
    -- Continue to try send_queue
  end;
  
  -- Try send_queue
  begin
    -- Get broadcast_id from queue metadata
    select metadata->>'broadcast_id' into v_broadcast_id
    from public.send_queue
    where id::text = p_queue_id::text;
    
    if v_broadcast_id is null then
      return; -- Not a broadcast email
    end if;
    
    -- Find recipient
    select id into v_recipient_id
    from public.broadcast_recipients
    where queue_id = p_queue_id::text;
    
    if v_recipient_id is null then
      return;
    end if;
    
    -- Update recipient based on event type
    case p_event_type
      when 'sent' then
        update public.broadcast_recipients
        set sent = true, sent_at = p_event_at
        where id = v_recipient_id;
      when 'delivered' then
        update public.broadcast_recipients
        set delivered = true, delivered_at = p_event_at
        where id = v_recipient_id;
      when 'opened' then
        update public.broadcast_recipients
        set opened = true, opened_at = p_event_at
        where id = v_recipient_id;
      when 'clicked' then
        update public.broadcast_recipients
        set clicked = true, clicked_at = p_event_at
        where id = v_recipient_id;
      when 'replied' then
        update public.broadcast_recipients
        set replied = true, replied_at = p_event_at
        where id = v_recipient_id;
      when 'bounced' then
        update public.broadcast_recipients
        set bounced = true, bounced_at = p_event_at
        where id = v_recipient_id;
      when 'spam' then
        update public.broadcast_recipients
        set spam = true, spam_at = p_event_at
        where id = v_recipient_id;
      when 'unsubscribe' then
        update public.broadcast_recipients
        set unsubscribe = true, unsubscribe_at = p_event_at
        where id = v_recipient_id;
    end case;
    
    -- Check if broadcast should be marked as completed
    -- (All recipients sent and no pending queue items)
    if not exists (
      select 1 from public.broadcast_recipients br
      join public.send_queue sq on sq.id::text = br.queue_id
      where br.broadcast_id = (v_broadcast_id::uuid)
        and sq.status IN ('pending', 'queued', 'running', 'locked')
    ) then
      update public.broadcasts
      set status = 'completed',
          completed_at = now()
      where id = (v_broadcast_id::uuid)
        and status = 'sending';
    end if;
  exception when others then
    -- Ignore errors
  end;
end;
$$;

-- ============================================================================
-- 7️⃣ AUTO-PAUSE INTEGRATION
-- ============================================================================

-- Function: Auto-pause broadcast on bounce/spam spike
create or replace function public.check_broadcast_health(
  p_broadcast_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast record;
  v_sent_count int;
  v_bounce_count int;
  v_spam_count int;
  v_bounce_rate numeric;
  v_spam_rate numeric;
begin
  select * into v_broadcast
  from public.broadcasts
  where id = p_broadcast_id;
  
  if not found or v_broadcast.status != 'sending' then
    return;
  end if;
  
  -- Get recent stats (last 100 sends)
  select 
    count(*) filter (where sent = true),
    count(*) filter (where bounced = true),
    count(*) filter (where spam = true)
  into v_sent_count, v_bounce_count, v_spam_count
  from public.broadcast_recipients
  where broadcast_id = p_broadcast_id
    and sent_at >= now() - interval '1 hour';
  
  if v_sent_count < 10 then
    return; -- Need at least 10 sends to check
  end if;
  
  v_bounce_rate := (v_bounce_count::numeric / v_sent_count::numeric);
  v_spam_rate := (v_spam_count::numeric / v_sent_count::numeric);
  
  -- Auto-pause if bounce rate > 5% or spam rate > 1%
  if v_bounce_rate > 0.05 or v_spam_rate > 0.01 then
    update public.broadcasts
    set status = 'paused'
    where id = p_broadcast_id;
    
    -- Log activity
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workspace_activity_log') then
      insert into public.workspace_activity_log (
        workspace_id,
        user_id,
        entity_type,
        entity_id,
        action,
        details
      )
      values (
        v_broadcast.workspace_id,
        v_broadcast.created_by,
        'broadcast',
        p_broadcast_id,
        'pause',
        jsonb_build_object(
          'reason', 'auto_pause',
          'bounce_rate', v_bounce_rate,
          'spam_rate', v_spam_rate
        )
      );
    end if;
  end if;
end;
$$;

-- ============================================================================
-- 8️⃣ ADD BROADCASTS TO SAVED VIEWS ENTITY TYPES
-- ============================================================================

-- Update saved_views entity_type check constraint to include 'broadcasts'
alter table public.saved_views
drop constraint if exists saved_views_entity_type_check;

alter table public.saved_views
add constraint saved_views_entity_type_check
check (entity_type in ('leads', 'campaigns', 'inboxes', 'sequences', 'events', 'domains', 'broadcasts'));

-- ============================================================================
-- 9️⃣ ADD WORKSPACE SETTINGS FOR BROADCAST PERMISSIONS
-- ============================================================================

-- Add settings column to workspaces if it doesn't exist
alter table public.workspaces
add column if not exists settings jsonb default '{}'::jsonb;

-- Create index for settings queries
create index if not exists idx_workspaces_settings on public.workspaces using gin (settings);

-- ============================================================================
-- 🔟 EMAIL EVENT TRACKING INTEGRATION
-- ============================================================================

-- Trigger function to update broadcast recipients when email events occur
-- This should be called from your email event handlers (webhooks, etc.)
-- Example: SELECT update_broadcast_recipient_event('queue_id', 'sent', now());

-- Note: You'll need to call this function from your email provider webhooks
-- when events like 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'spam' occur

-- ============================================================================
-- 1️⃣1️⃣ GRANT PERMISSIONS
-- ============================================================================

grant select, insert, update on public.broadcasts to authenticated;
grant select, insert, update on public.broadcast_recipients to authenticated;
grant select on public.v_broadcast_stats to authenticated;
grant select on public.v_broadcast_stats_by_inbox to authenticated;
grant execute on function public.prepare_broadcast_send(uuid) to authenticated;
grant execute on function public.queue_broadcast_emails(uuid, int) to authenticated;
grant execute on function public.update_broadcast_recipient_event(text, text, timestamptz) to authenticated;
grant execute on function public.check_broadcast_health(uuid) to authenticated;

-- ============================================================================
-- 1️⃣2️⃣ NOTES FOR INTEGRATION
-- ============================================================================

-- To integrate email event tracking:
-- 1. When an email is sent from send_queue, call:
--    SELECT update_broadcast_recipient_event(queue_id, 'sent', now());
--
-- 2. When email provider webhooks fire (delivered, opened, clicked, etc.), call:
--    SELECT update_broadcast_recipient_event(queue_id, 'delivered', now());
--    SELECT update_broadcast_recipient_event(queue_id, 'opened', now());
--    SELECT update_broadcast_recipient_event(queue_id, 'clicked', now());
--    SELECT update_broadcast_recipient_event(queue_id, 'replied', now());
--    SELECT update_broadcast_recipient_event(queue_id, 'bounced', now());
--    SELECT update_broadcast_recipient_event(queue_id, 'spam', now());
--
-- 3. Set up a cron job to call send-broadcast function every minute:
--    This will process scheduled broadcasts and queue emails for sending broadcasts
--
-- 4. The broadcast will auto-pause if bounce rate > 5% or spam rate > 1%
--    Check health periodically: SELECT check_broadcast_health(broadcast_id);

