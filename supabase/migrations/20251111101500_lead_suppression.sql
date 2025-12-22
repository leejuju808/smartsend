-- Lead suppression system and negative reply guardrails (idempotent)

-- ============================================================================
-- A) Lead-level suppression ledger
-- ============================================================================
create table if not exists public.lead_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  reason text not null,
  note text,
  unique (campaign_id, lead_id, reason)
);

create index if not exists idx_lead_suppressions_lead on public.lead_suppressions(lead_id);
create index if not exists idx_lead_suppressions_campaign on public.lead_suppressions(campaign_id);

alter table public.leads
  add column if not exists is_suppressed boolean not null default false,
  add column if not exists suppressed_at timestamptz;

update public.leads l
   set is_suppressed = true,
       suppressed_at = coalesce(l.suppressed_at, now())
 where exists (
   select 1
   from public.lead_suppressions s
   where s.lead_id = l.id
 );

-- ============================================================================
-- B) Suppression events log
-- ============================================================================
create table if not exists public.suppression_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  event text not null,
  detail text
);

create index if not exists idx_suppression_events_thread on public.suppression_events(thread_id);
create index if not exists idx_suppression_events_lead on public.suppression_events(lead_id);

-- ============================================================================
-- C) RLS policies
-- ============================================================================
alter table public.lead_suppressions enable row level security;
alter table public.suppression_events enable row level security;

grant select, insert, update, delete on public.lead_suppressions to authenticated;
grant select, insert, update, delete on public.suppression_events to authenticated;

drop policy if exists "lead_suppressions_read" on public.lead_suppressions;
create policy "lead_suppressions_read" on public.lead_suppressions
  for select to authenticated
  using (
    (
      lead_suppressions.campaign_id is not null
      and public.is_campaign_member(lead_suppressions.campaign_id, auth.uid(), array['owner','editor'])
    )
    or (
      lead_suppressions.campaign_id is null
      and exists (
        select 1
          from public.campaign_members m
          join public.campaign_leads cl on cl.campaign_id = m.campaign_id
         where cl.lead_id = lead_suppressions.lead_id
           and m.user_id = auth.uid()
           and m.role = any('{owner,editor}')
      )
    )
  );

drop policy if exists "lead_suppressions_write" on public.lead_suppressions;
create policy "lead_suppressions_write" on public.lead_suppressions
  for insert to authenticated
  with check (
    (
      lead_suppressions.campaign_id is not null
      and public.is_campaign_member(lead_suppressions.campaign_id, auth.uid(), array['owner','editor'])
    )
    or (
      lead_suppressions.campaign_id is null
      and exists (
        select 1
          from public.campaign_members m
          join public.campaign_leads cl on cl.campaign_id = m.campaign_id
         where cl.lead_id = lead_suppressions.lead_id
           and m.user_id = auth.uid()
           and m.role = any('{owner,editor}')
      )
    )
  );

drop policy if exists "lead_suppressions_update" on public.lead_suppressions;
create policy "lead_suppressions_update" on public.lead_suppressions
  for update to authenticated
  using (
    (
      lead_suppressions.campaign_id is not null
      and public.is_campaign_member(lead_suppressions.campaign_id, auth.uid(), array['owner','editor'])
    )
    or (
      lead_suppressions.campaign_id is null
      and exists (
        select 1
          from public.campaign_members m
          join public.campaign_leads cl on cl.campaign_id = m.campaign_id
         where cl.lead_id = lead_suppressions.lead_id
           and m.user_id = auth.uid()
           and m.role = any('{owner,editor}')
      )
    )
  )
  with check (
    (
      lead_suppressions.campaign_id is not null
      and public.is_campaign_member(lead_suppressions.campaign_id, auth.uid(), array['owner','editor'])
    )
    or (
      lead_suppressions.campaign_id is null
      and exists (
        select 1
          from public.campaign_members m
          join public.campaign_leads cl on cl.campaign_id = m.campaign_id
         where cl.lead_id = lead_suppressions.lead_id
           and m.user_id = auth.uid()
           and m.role = any('{owner,editor}')
      )
    )
  );

drop policy if exists "lead_suppressions_delete" on public.lead_suppressions;
create policy "lead_suppressions_delete" on public.lead_suppressions
  for delete to authenticated
  using (
    (
      lead_suppressions.campaign_id is not null
      and public.is_campaign_member(lead_suppressions.campaign_id, auth.uid(), array['owner','editor'])
    )
    or (
      lead_suppressions.campaign_id is null
      and exists (
        select 1
          from public.campaign_members m
          join public.campaign_leads cl on cl.campaign_id = m.campaign_id
         where cl.lead_id = lead_suppressions.lead_id
           and m.user_id = auth.uid()
           and m.role = any('{owner,editor}')
      )
    )
  );

drop policy if exists "suppression_events_select" on public.suppression_events;
create policy "suppression_events_select" on public.suppression_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = suppression_events.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "suppression_events_insert" on public.suppression_events;
create policy "suppression_events_insert" on public.suppression_events
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = suppression_events.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "suppression_events_update" on public.suppression_events;
create policy "suppression_events_update" on public.suppression_events
  for update to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = suppression_events.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  )
  with check (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = suppression_events.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "suppression_events_delete" on public.suppression_events;
create policy "suppression_events_delete" on public.suppression_events
  for delete to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = suppression_events.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner','editor'})
    )
  );

-- ============================================================================
-- D) Send queue guard (never send to suppressed leads)
-- ============================================================================
alter table public.send_queue
  add column if not exists canceled_reason text;

alter table public.send_queue
  drop constraint if exists send_queue_status_check;

alter table public.send_queue
  add constraint send_queue_status_check
    check (
      status in (
        'pending','picked','queued','working','done','sent','failed',
        'error','paused','dead','skipped','draft','canceled'
      )
    );

drop policy if exists "sq_ro" on public.send_queue;
drop policy if exists "sq_read_manage" on public.send_queue;
create policy "sq_read_manage" on public.send_queue
  for select to authenticated
  using (
    public.is_campaign_member(send_queue.campaign_id, auth.uid(), array['owner','editor'])
  );

create or replace view public.v_send_queue_ready as
select q.*
from public.send_queue q
join public.inbox_threads t on t.id = q.thread_id
join public.leads l on l.id = t.lead_id
left join public.lead_suppressions s
  on s.lead_id = l.id
 and (s.campaign_id is null or s.campaign_id = t.campaign_id)
where q.status in ('pending','queued')
  and (t.paused_until is null or t.paused_until <= now())
  and coalesce(l.is_suppressed, false) = false
  and s.id is null
  and (q.not_before is null or q.not_before <= now());

alter view public.v_send_queue_ready set (security_invoker = on);
grant select on public.v_send_queue_ready to authenticated;

-- ============================================================================
-- E) Trigger: suppress on negative replies
-- ============================================================================
create or replace function public.suppress_on_negative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reply_type = 'negative' and coalesce(old.reply_type, '') <> 'negative' then
    insert into public.lead_suppressions (campaign_id, lead_id, reason, note)
    values (new.campaign_id, new.lead_id, 'negative', 'auto from reply classifier')
    on conflict (campaign_id, lead_id, reason) do nothing;

    update public.leads
       set is_suppressed = true,
           suppressed_at = coalesce(suppressed_at, now())
     where id = new.lead_id
       and is_suppressed = false;

    update public.send_queue q
       set status = 'canceled',
           canceled_reason = 'suppressed_negative'
     where q.thread_id = new.id
       and q.status in ('pending','queued','picked','draft','working');

    insert into public.suppression_events (campaign_id, thread_id, lead_id, event, detail)
    values (new.campaign_id, new.id, new.lead_id, 'auto_negative', 'reply_type flipped to negative');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_suppress_on_negative on public.inbox_threads;
create trigger trg_suppress_on_negative
after update of reply_type on public.inbox_threads
for each row
execute function public.suppress_on_negative();

-- ============================================================================
-- F) Edge function invocation for close-loop drafts
-- ============================================================================
create or replace function public.call_draft_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.edge_base_url();
  v_auth text := current_setting('app.settings.service_role_key', true);
begin
  if new.reply_type = 'negative' and coalesce(old.reply_type, '') <> 'negative' then
    if coalesce(v_url, '') = '' or coalesce(v_auth, '') = '' then
      return new;
    end if;

    perform net.http_post(
      url := v_url || '/draft-close-loop',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_auth
      ),
      body := jsonb_build_object('thread_id', new.id)::text,
      timeout_milliseconds := 8000
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_call_draft_close on public.inbox_threads;
create trigger trg_call_draft_close
after update of reply_type on public.inbox_threads
for each row
execute function public.call_draft_close();

-- ============================================================================
-- G) Follow-up task access (owners/editors may manage)
-- ============================================================================
drop policy if exists "fut_read" on public.followup_tasks;
create policy "fut_read" on public.followup_tasks
  for select to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = followup_tasks.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "fut_insert" on public.followup_tasks;
create policy "fut_insert" on public.followup_tasks
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = followup_tasks.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "fut_write" on public.followup_tasks;
drop policy if exists "fut_update" on public.followup_tasks;
create policy "fut_update" on public.followup_tasks
  for update to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = followup_tasks.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  )
  with check (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = followup_tasks.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );

drop policy if exists "fut_delete" on public.followup_tasks;
create policy "fut_delete" on public.followup_tasks
  for delete to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = followup_tasks.campaign_id
         and m.user_id = auth.uid()
         and m.role = any('{owner,editor}')
    )
  );


