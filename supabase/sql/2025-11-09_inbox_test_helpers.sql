-- QA reply classification helpers (idempotent)

set check_function_bodies = off;

create or replace function public.test_make_thread(
  p_subject text default 'Rewriter QA',
  p_campaign_name text default 'Rewriter QA Campaign'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_thread uuid;
begin
  select id
    into v_campaign
  from public.campaigns
  where name = coalesce(p_campaign_name, 'Rewriter QA Campaign')
  limit 1;

  if v_campaign is null then
    insert into public.campaigns (id, name)
    values (gen_random_uuid(), coalesce(p_campaign_name, 'Rewriter QA Campaign'))
    returning id into v_campaign;
  end if;

  select id
    into v_lead
  from public.leads
  where email = 'rewriter.lead@example.com'
  limit 1;

  if v_lead is null then
    insert into public.leads (id, email, full_name)
    values (
      gen_random_uuid(),
      'rewriter.lead@example.com',
      'Rewrite Lead'
    )
    returning id into v_lead;
  end if;

  insert into public.inbox_threads (id, campaign_id, lead_id, subject)
  values (
    gen_random_uuid(),
    v_campaign,
    v_lead,
    coalesce(p_subject, 'Rewriter QA')
  )
  returning id into v_thread;

  return v_thread;
end;
$$;

create or replace function public.test_inbound(
  p_thread uuid,
  p_text text,
  p_subject text default 'Re: Test'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg uuid;
begin
  insert into public.normalized_messages (
    id,
    linked_thread_id,
    direction,
    subject,
    text_body,
    sent_at
  )
  values (
    gen_random_uuid(),
    p_thread,
    'inbound',
    p_subject,
    p_text,
    now()
  )
  returning id into v_msg;

  return v_msg;
end;
$$;

create or replace view public.v_test_labels as
select
  rc.message_id,
  rc.thread_id,
  rc.label,
  rc.confidence,
  rc.created_at
from public.reply_classes rc
where rc.thread_id in (
  select id
  from public.inbox_threads
  where campaign_id in (
    select id
    from public.campaigns
    where name in ('QA Campaign', 'Rewriter QA Campaign')
  )
);

create or replace view public.v_test_threads as
select
  t.id as thread_id,
  t.subject,
  t.snoozed_until
from public.inbox_threads t
where t.campaign_id in (
  select id
  from public.campaigns
  where name in ('QA Campaign', 'Rewriter QA Campaign')
);

create or replace function public.test_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reply_classes rc
  using public.inbox_threads t
  where rc.thread_id = t.id
    and t.campaign_id in (
      select id from public.campaigns where name in ('QA Campaign', 'Rewriter QA Campaign')
    );

  delete from public.out_of_office_logs o
  using public.inbox_threads t
  where o.thread_id = t.id
    and t.campaign_id in (
      select id from public.campaigns where name in ('QA Campaign', 'Rewriter QA Campaign')
    );

  delete from public.normalized_messages m
  where m.linked_thread_id in (
    select id
    from public.inbox_threads
    where campaign_id in (
      select id from public.campaigns where name in ('QA Campaign', 'Rewriter QA Campaign')
    )
  );

  delete from public.inbox_threads
  where campaign_id in (
    select id from public.campaigns where name in ('QA Campaign', 'Rewriter QA Campaign')
  );

  delete from public.leads
  where email like 'qa.%@example.com'
     or email = 'rewriter.lead@example.com';

  delete from public.campaigns
  where name in ('QA Campaign', 'Rewriter QA Campaign');
end;
$$;

create or replace function public.test_thread_messages(
  p_thread uuid,
  p_outbound text,
  p_inbound text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out uuid;
  v_in uuid;
begin
  insert into public.normalized_messages (
    id,
    linked_thread_id,
    direction,
    subject,
    text_body,
    sent_at
  )
  values (
    gen_random_uuid(),
    p_thread,
    'outbound',
    'Seq Step',
    p_outbound,
    now() - interval '1 day'
  )
  returning id into v_out;

  insert into public.normalized_messages (
    id,
    linked_thread_id,
    direction,
    subject,
    text_body,
    sent_at
  )
  values (
    gen_random_uuid(),
    p_thread,
    'inbound',
    'Re: Seq Step',
    p_inbound,
    now()
  )
  returning id into v_in;

  return v_in;
end;
$$;

create or replace view public.v_test_rewrites as
select
  created_at,
  thread_id,
  message_id,
  reply_label,
  subject
from public.reply_rewrites
order by created_at desc;

create or replace function public.test_cleanup_rewriter()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reply_rewrites
  where thread_id in (
    select id
    from public.inbox_threads
    where campaign_id in (
      select id from public.campaigns where name = 'Rewriter QA Campaign'
    )
  );

  delete from public.reply_classes
  where thread_id in (
    select id
    from public.inbox_threads
    where campaign_id in (
      select id from public.campaigns where name = 'Rewriter QA Campaign'
    )
  );

  delete from public.normalized_messages
  where linked_thread_id in (
    select id
    from public.inbox_threads
    where campaign_id in (
      select id from public.campaigns where name = 'Rewriter QA Campaign'
    )
  );

  delete from public.inbox_threads
  where campaign_id in (
    select id
    from public.campaigns
    where name = 'Rewriter QA Campaign'
  );

  delete from public.leads
  where email = 'rewriter.lead@example.com';

  delete from public.campaigns
  where name = 'Rewriter QA Campaign';
end;
$$;

reset check_function_bodies;

