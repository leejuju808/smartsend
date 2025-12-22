-- Block 15200 — A/B Subject Line Testing v1
-- Boost Open Rates → More Replies → More Jobs
-- 
-- This block turns SmartSend from "send emails" into "optimize emails."
-- Roofers get more opens, which means more replies, which means more booked jobs.
--
-- We keep v1 SIMPLE & MONEY-FOCUSED:
-- - Only A/B subject line testing (body stays the same)
-- - 2 variants: A and B
-- - SmartSend automatically:
--   - Splits the audience 50/50
--   - Tracks opens per variant
--   - Shows which one won
--   - Uses the winner for all follow-up steps in the sequence

-- 1. DB Changes: Add Subject Variants to Campaign Steps
-- ─────────────────────────────────────────────────────────────

-- Extend campaign_steps with optional A/B subject lines
alter table public.campaign_steps
  add column if not exists subject_variant_a text,
  add column if not exists subject_variant_b text,
  add column if not exists ab_test_enabled boolean not null default false,
  add column if not exists ab_test_winner text check (
    ab_test_winner is null or ab_test_winner in ('A', 'B')
  );

-- Also extend smartsend_sequence_steps (used by UI)
alter table public.smartsend_sequence_steps
  add column if not exists subject_variant_a text,
  add column if not exists subject_variant_b text,
  add column if not exists ab_test_enabled boolean not null default false,
  add column if not exists ab_test_winner text check (
    ab_test_winner is null or ab_test_winner in ('A', 'B')
  );

-- Set fallback (for older campaigns): copy subject_template to subject_variant_a
do $$
begin
  -- For campaign_steps
  if exists (select 1 from information_schema.columns 
             where table_name = 'campaign_steps' and column_name = 'subject_template') then
    update public.campaign_steps
    set subject_variant_a = subject_template
    where subject_variant_a is null and subject_template is not null;
  end if;
  
  -- For smartsend_sequence_steps
  if exists (select 1 from information_schema.columns 
             where table_name = 'smartsend_sequence_steps' and column_name = 'subject') then
    update public.smartsend_sequence_steps
    set subject_variant_a = subject
    where subject_variant_a is null and subject is not null;
  end if;
end $$;

-- Add indexes for efficient queries
create index if not exists idx_campaign_steps_ab_test 
  on public.campaign_steps(campaign_id, step_no) 
  where ab_test_enabled = true;

create index if not exists idx_smartsend_sequence_steps_ab_test 
  on public.smartsend_sequence_steps(campaign_id, position) 
  where ab_test_enabled = true;

-- 2. Add ab_variant to email_messages table
-- ─────────────────────────────────────────────────────────────

-- Check which email_messages table structure exists and add column
do $$
begin
  -- Try to add to email_messages if it exists
  if exists (select 1 from information_schema.tables 
             where table_schema = 'public' and table_name = 'email_messages') then
    alter table public.email_messages
      add column if not exists ab_variant text check (
        ab_variant is null or ab_variant in ('A', 'B')
      );
    
    alter table public.email_messages
      add column if not exists step_id uuid;
    
    -- Add indexes for A/B analytics
    create index if not exists idx_email_messages_ab_variant 
      on public.email_messages(campaign_id, step_id, ab_variant) 
      where ab_variant is not null;
  end if;
  
  -- Also add to campaign_messages if it exists
  if exists (select 1 from information_schema.tables 
             where table_schema = 'public' and table_name = 'campaign_messages') then
    alter table public.campaign_messages
      add column if not exists ab_variant text check (
        ab_variant is null or ab_variant in ('A', 'B')
      );
    
    alter table public.campaign_messages
      add column if not exists step_id uuid;
    
    create index if not exists idx_campaign_messages_ab_variant 
      on public.campaign_messages(campaign_id, step_id, ab_variant) 
      where ab_variant is not null;
  end if;
end $$;

-- 3. Add ab_variant to send_queue for tracking before send
-- ─────────────────────────────────────────────────────────────

alter table public.send_queue
  add column if not exists ab_variant text check (
    ab_variant is null or ab_variant in ('A', 'B')
  );

create index if not exists idx_send_queue_ab_variant 
  on public.send_queue(campaign_id, step_no, ab_variant) 
  where ab_variant is not null;

-- 4. Create view for A/B test stats per variant
-- ─────────────────────────────────────────────────────────────

create or replace view public.ab_test_stats as
select
  coalesce(em.campaign_id, cm.campaign_id) as campaign_id,
  coalesce(em.step_id, cm.step_id) as step_id,
  coalesce(em.ab_variant, cm.ab_variant) as ab_variant,
  count(*) filter (where coalesce(em.id, cm.id) is not null) as sent,
  count(*) filter (where 
    (em.opened_at is not null) or 
    (cm.last_open_at is not null) or
    (exists (
      select 1 from public.email_events ee
      where ee.message_id = coalesce(em.id, cm.id)
      and ee.type = 'open'
    ))
  ) as opened
from (
  select campaign_id, step_id, ab_variant, id, opened_at
  from public.email_messages
  where ab_variant is not null
  union all
  select campaign_id, step_id, ab_variant, id, last_open_at as opened_at
  from public.campaign_messages
  where ab_variant is not null
) as combined_messages
left join public.email_messages em on em.id = combined_messages.id
left join public.campaign_messages cm on cm.id = combined_messages.id
group by 
  coalesce(em.campaign_id, cm.campaign_id),
  coalesce(em.step_id, cm.step_id),
  coalesce(em.ab_variant, cm.ab_variant);

-- Simplified version that works with either table structure
create or replace view public.ab_test_stats_simple as
select
  cs.campaign_id,
  cs.step_no as step_id,
  sq.ab_variant,
  count(*) as sent,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched')) as delivered,
  -- Opens tracked via email_events or opened_at columns
  count(*) filter (where exists (
    select 1 from public.email_events ee
    where ee.message_id = sq.id
    and ee.type = 'open'
  )) as opened
from public.campaign_steps cs
join public.send_queue sq on sq.campaign_id = cs.campaign_id and sq.step_no = cs.step_no
where cs.ab_test_enabled = true
  and sq.ab_variant is not null
group by cs.campaign_id, cs.step_no, sq.ab_variant;

-- 5. Helper function to evaluate A/B test winner
-- ─────────────────────────────────────────────────────────────

create or replace function public.evaluate_ab_test_winner(
  p_campaign_id uuid,
  p_step_id uuid default null,
  p_step_no int default null,
  p_min_sends int default 100
)
returns text
language plpgsql
as $$
declare
  v_stats_a record;
  v_stats_b record;
  v_rate_a numeric;
  v_rate_b numeric;
  v_sent_a int;
  v_sent_b int;
begin
  -- Get stats for variant A
  select 
    sum(sent) as total_sent,
    sum(opened) as total_opened
  into v_stats_a
  from public.ab_test_stats_simple
  where campaign_id = p_campaign_id
    and (p_step_id is null or step_id::text = p_step_id::text)
    and (p_step_no is null or step_id = p_step_no)
    and ab_variant = 'A';

  -- Get stats for variant B
  select 
    sum(sent) as total_sent,
    sum(opened) as total_opened
  into v_stats_b
  from public.ab_test_stats_simple
  where campaign_id = p_campaign_id
    and (p_step_id is null or step_id::text = p_step_id::text)
    and (p_step_no is null or step_id = p_step_no)
    and ab_variant = 'B';

  v_sent_a := coalesce(v_stats_a.total_sent, 0);
  v_sent_b := coalesce(v_stats_b.total_sent, 0);

  -- Need at least min_sends total
  if (v_sent_a + v_sent_b) < p_min_sends then
    return null; -- Not enough data yet
  end if;

  -- Calculate open rates
  v_rate_a := case when v_sent_a > 0 then (coalesce(v_stats_a.total_opened, 0)::numeric / v_sent_a) * 100 else 0 end;
  v_rate_b := case when v_sent_b > 0 then (coalesce(v_stats_b.total_opened, 0)::numeric / v_sent_b) * 100 else 0 end;

  -- Determine winner (if tie, choose A)
  if v_rate_a >= v_rate_b then
    return 'A';
  else
    return 'B';
  end if;
end;
$$;

comment on function public.evaluate_ab_test_winner is 'Evaluates A/B test and returns winner variant (A or B) based on open rates';

-- 6. Comments for documentation
-- ─────────────────────────────────────────────────────────────

comment on column public.campaign_steps.subject_variant_a is 'Variant A subject line for A/B testing (Block 15200)';
comment on column public.campaign_steps.subject_variant_b is 'Variant B subject line for A/B testing (Block 15200)';
comment on column public.campaign_steps.ab_test_enabled is 'Whether A/B subject line testing is enabled for this step';
comment on column public.campaign_steps.ab_test_winner is 'Winner variant (A or B) determined after sufficient sends';

comment on column public.smartsend_sequence_steps.subject_variant_a is 'Variant A subject line for A/B testing (Block 15200)';
comment on column public.smartsend_sequence_steps.subject_variant_b is 'Variant B subject line for A/B testing (Block 15200)';
comment on column public.smartsend_sequence_steps.ab_test_enabled is 'Whether A/B subject line testing is enabled for this step';
comment on column public.smartsend_sequence_steps.ab_test_winner is 'Winner variant (A or B) determined after sufficient sends';



























































