-- Sender controls, helpers, jitter scheduling, paced claimer, and monitoring views
-- Run in Supabase SQL or include as a migration

-- 1) Config knobs (per-mailbox)
alter table public.connected_accounts
  add column if not exists parallel_sends_limit int default 2 check (parallel_sends_limit between 1 and 10),
  add column if not exists min_gap_seconds int default 10 check (min_gap_seconds between 0 and 600),
  add column if not exists domain_rate_per_min int default 20 check (domain_rate_per_min between 1 and 200),
  add column if not exists jitter_max_seconds int default 60 check (jitter_max_seconds between 0 and 600),
  add column if not exists sending_timeout_seconds int default 300 check (sending_timeout_seconds between 60 and 3600);


-- 2) Helpers: domain, last-sent, rate windows, stuck reaper
-- Extract domain safely
create or replace function public.email_domain(p_email citext)
returns text language sql immutable as $$
  select case
    when position('@' in p_email) > 0 then lower(split_part(p_email::text, '@', 2))
    else null
  end
$$;

-- Last sent timestamp for an account
create or replace function public.last_sent_at(p_account uuid)
returns timestamptz language sql stable as $$
  select max(created_at) from public.send_logs
  where account_id = p_account and status = 'sent'
$$;

-- Sent count to a domain in the last minute (per account)
create or replace function public.domain_sends_last_min(p_account uuid, p_domain text)
returns int language sql stable as $$
  select count(*)::int
  from public.send_logs s
  join public.leads l on l.id = s.lead_id
  where s.account_id = p_account
    and s.status = 'sent'
    and (l.domain = p_domain or public.email_domain(l.email) = p_domain)
    and s.created_at >= now() - interval '60 seconds'
$$;

-- Reclaim stuck 'sending' rows older than sending_timeout_seconds
create or replace function public.reap_stuck_sending()
returns int language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  update public.send_queue q
  set status='queued', locked_at=null, locked_by=null, updated_at=now()
  from public.connected_accounts a
  where q.status='sending'
    and q.account_id = a.id
    and q.locked_at is not null
    and q.locked_at < now() - make_interval(secs => coalesce(a.sending_timeout_seconds,300))
  ;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- 3) Jitter at scheduling time
create or replace function public.enqueue_next_campaign_step(
  p_campaign uuid,
  p_lead uuid,
  p_sent_step int,
  p_sent_at timestamptz
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_next record;
  v_account uuid;
  v_base timestamptz;
  v_sched timestamptz;
  v_email citext;
  v_ctx jsonb;
  v_subject text;
  v_body text;
  v_jitter int := 0;
  v_jitter_cfg int := 0;
begin
  select email into v_email from public.leads where id = p_lead;
  select account_id into v_account from public.campaigns where id = p_campaign;
  if public.is_suppressed(v_email, v_account) then return; end if;

  select id, step_no, offset_days, subject_template, body_html_template
    into v_next
  from public.campaign_steps
  where campaign_id = p_campaign and enabled and step_no = p_sent_step + 1
  order by step_no limit 1;
  if not found then return; end if;

  v_base := p_sent_at + (v_next.offset_days || ' days')::interval;
  v_sched := public.business_windowed_send_time_for_step(v_account, v_base, v_next.id);

  -- Jitter
  select coalesce(jitter_max_seconds,0) into v_jitter_cfg
  from public.connected_accounts where id = v_account;
  if v_jitter_cfg > 0 then
    v_jitter := floor(random() * v_jitter_cfg);
    v_sched := v_sched + make_interval(secs => v_jitter);
  end if;

  v_ctx := public.template_context_for_lead(p_campaign, p_lead);
  v_subject := public.render_template(v_next.subject_template, v_ctx);
  v_body    := public.render_template(v_next.body_html_template, v_ctx);

  insert into public.send_queue (campaign_id, lead_id, account_id, step_no, scheduled_for, subject, body_html, status)
  values (p_campaign, p_lead, v_account, v_next.step_no, v_sched, v_subject, v_body, 'queued');
end;
$$;


-- 4) Concurrency, pacing, and domain caps in the claimer
create or replace function public.claim_send_batch(p_worker text, p_batch int default 20)
returns setof public.send_queue
language plpgsql security definer set search_path=public as $$
declare v_ids uuid[];
begin
  -- First, reclaim stuck rows
  perform public.reap_stuck_sending();

  with ready as (
    select
      q.id,
      q.account_id,
      a.parallel_sends_limit,
      a.min_gap_seconds,
      a.domain_rate_per_min,
      coalesce(public.last_sent_at(q.account_id), 'epoch') as last_sent,
      l.email,
      coalesce(l.domain, public.email_domain(l.email)) as rdomain,
      -- live counts at claim time
      (select count(*) from public.send_queue
         where account_id = q.account_id and status='sending') as inflight
    from public.send_queue q
    join public.connected_accounts a on a.id = q.account_id
    join public.leads l on l.id = q.lead_id
    where q.status='queued'
      and q.scheduled_for <= now()
      and public.account_sends_today(q.account_id) < public.effective_daily_cap(q.account_id)
      and not public.is_suppressed(l.email, q.account_id)
  ),
  filtered as (
    select r.*
    from ready r
    where
      -- concurrency gate
      r.inflight < coalesce(r.parallel_sends_limit, 2)
      -- per-account pacing
      and (r.last_sent is null or now() >= r.last_sent + make_interval(secs => coalesce(r.min_gap_seconds,10)))
      -- per-domain rate (last minute)
      and (
        r.rdomain is null
        or public.domain_sends_last_min(r.account_id, r.rdomain) < coalesce(r.domain_rate_per_min,20)
      )
    order by (select scheduled_for from public.send_queue where id = r.id) asc
    limit p_batch
    for update of r skip locked
  )
  update public.send_queue q
     set status='sending', locked_at=now(), locked_by=p_worker, updated_at=now()
   where q.id in (select id from filtered)
  returning q.id into v_ids;

  return query select * from public.send_queue where id = any(v_ids);
end;
$$;


-- 5) Quick monitoring views
create or replace view public.sender_health as
select
  a.id as account_id,
  a.email_address,
  a.parallel_sends_limit,
  a.min_gap_seconds,
  a.domain_rate_per_min,
  a.jitter_max_seconds,
  public.last_sent_at(a.id) as last_sent_at,
  (select count(*) from public.send_queue q where q.account_id=a.id and q.status='sending') as inflight,
  (select count(*) from public.send_queue q where q.account_id=a.id and q.status='queued' and q.scheduled_for<=now()) as due_now
from public.connected_accounts a;

create or replace view public.domain_minute_pressure as
select
  a.email_address,
  coalesce(l.domain, public.email_domain(l.email)) as domain,
  count(*) filter (where s.created_at >= now() - interval '60 seconds') as sent_last_min
from public.send_logs s
join public.connected_accounts a on a.id = s.account_id
join public.leads l on l.id = s.lead_id
where s.status='sent'
group by 1,2
order by sent_last_min desc nulls last;


