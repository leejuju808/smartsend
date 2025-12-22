-- Add billing_account_id to send_queue and update claim function
-- Also update enqueue function to set billing_account_id

-- Add billing_account_id to send_queue
alter table public.send_queue
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete set null;

-- Backfill billing_account_id in send_queue from campaigns
update public.send_queue q
set billing_account_id = c.billing_account_id
from public.campaigns c
where q.campaign_id = c.id and q.billing_account_id is null;

-- Update claim_send_batch to enforce plan caps
create or replace function public.claim_send_batch(p_worker text, p_batch int default 20)
returns setof public.send_queue
language plpgsql security definer set search_path=public as $$
declare v_ids uuid[];
begin
  perform public.reap_stuck_sending();

  with ready as (
    select
      q.id,
      q.account_id,
      coalesce(a.billing_account_id, q.billing_account_id) as billing_account_id,
      case when coalesce(a.billing_account_id, q.billing_account_id) is not null 
        then public.usage_in_period(coalesce(a.billing_account_id, q.billing_account_id), 'send')
        else 0
      end as sends_used,
      case when coalesce(a.billing_account_id, q.billing_account_id) is not null
        then public.plan_send_cap(coalesce(a.billing_account_id, q.billing_account_id))
        else null
      end as plan_cap,
      a.parallel_sends_limit,
      a.min_gap_seconds,
      a.domain_rate_per_min,
      coalesce(public.last_sent_at(q.account_id), 'epoch') as last_sent,
      l.email,
      coalesce(l.domain, public.email_domain(l.email)) as rdomain,
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
      -- soft plan cap: allow only if we haven't exceeded (null cap means no limit)
      (r.plan_cap is null or r.sends_used < r.plan_cap)
      and r.inflight < coalesce(r.parallel_sends_limit, 2)
      and (r.last_sent is null or now() >= r.last_sent + make_interval(secs => coalesce(r.min_gap_seconds,10)))
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

-- Update complete_send_attempt to record usage
create or replace function public.complete_send_attempt(
  p_queue_id uuid,
  p_ok boolean,
  p_provider_msg_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.send_queue where id = p_queue_id for update;
  if not found then
    raise exception 'queue row not found';
  end if;

  -- Write log row
  insert into public.send_logs(
    campaign_id, account_id, thread_id, lead_id,
    step_no, status, provider_msg_id, error_message
  ) values (
    r.campaign_id, r.account_id, null, r.lead_id,
    r.step_no, case when p_ok then 'sent' else 'failed' end,
    p_provider_msg_id, p_error
  );

  -- Update queue status
  update public.send_queue
     set status = case when p_ok then 'sent' else 'failed' end,
         provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id),
         last_error = p_error,
         updated_at = now()
   where id = p_queue_id;

  -- Meter success only (you can also meter attempts if desired)
  if p_ok and r.billing_account_id is not null then
    perform public.record_usage(r.billing_account_id, 'send', 1, jsonb_build_object(
      'campaign_id', r.campaign_id,
      'lead_id', r.lead_id,
      'account_id', r.account_id,
      'step_no', r.step_no
    ));
  end if;

  -- If sent, the send_logs trigger you added earlier will auto-enqueue the next step.
end;
$$;

-- Update enqueue_next_campaign_step to set billing_account_id
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
  v_billing_account_id uuid;
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
  select account_id, billing_account_id into v_account, v_billing_account_id 
  from public.campaigns where id = p_campaign;
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

  insert into public.send_queue (campaign_id, lead_id, account_id, step_no, scheduled_for, subject, body_html, status, billing_account_id)
  values (p_campaign, p_lead, v_account, v_next.step_no, v_sched, v_subject, v_body, 'queued', v_billing_account_id);
end;
$$;

