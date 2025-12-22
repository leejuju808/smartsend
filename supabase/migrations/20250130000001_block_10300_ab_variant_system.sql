-- Block 10300 — A/B Variant System (Subject Line + Email Body Split Testing v1)
-- Purpose: Allow SmartSend users to run A/B tests for subject lines and email body content
-- This helps discover EXACTLY which message gets the most opens, replies, and HOT leads

-- 1. Add has_variants boolean to campaign_steps
alter table public.campaign_steps
  add column if not exists has_variants boolean not null default false;

create index if not exists idx_campaign_steps_has_variants 
  on public.campaign_steps(campaign_id, has_variants) 
  where has_variants = true;

-- 2. Create sequence_step_variants table
-- Note: Despite the name, this works with campaign_steps (step_id references campaign_steps.id)
create table if not exists public.sequence_step_variants (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  variant_key text not null check (variant_key in ('A', 'B')), -- V1: Only A and B
  subject text,
  body text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(step_id, variant_key)
);

create index if not exists idx_sequence_step_variants_step 
  on public.sequence_step_variants(step_id);

create index if not exists idx_sequence_step_variants_key 
  on public.sequence_step_variants(step_id, variant_key);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sequence_step_variants_updated_at on public.sequence_step_variants;
create trigger trg_sequence_step_variants_updated_at
  before update on public.sequence_step_variants
  for each row
  execute function public.set_updated_at();

-- 3. Add variant_key to messages table
-- This tracks which variant was sent for each message
alter table public.messages
  add column if not exists variant_key text check (variant_key in ('A', 'B') or variant_key is null);

create index if not exists idx_messages_variant_key 
  on public.messages(sequence_step_id, variant_key) 
  where variant_key is not null;

-- Also add variant_key to send_queue if it doesn't exist (for tracking before send)
alter table public.send_queue
  add column if not exists variant_key text check (variant_key in ('A', 'B') or variant_key is null);

create index if not exists idx_send_queue_variant_key 
  on public.send_queue(campaign_id, step_no, variant_key) 
  where variant_key is not null;

-- Also add variant_key to send_logs for historical tracking
alter table public.send_logs
  add column if not exists variant_key text check (variant_key in ('A', 'B') or variant_key is null);

create index if not exists idx_send_logs_variant_key 
  on public.send_logs(campaign_id, step_no, variant_key) 
  where variant_key is not null;

-- Add variant_key to reply_threads for tracking which variant generated the reply
-- This links replies back to the variant that was sent
alter table public.reply_threads
  add column if not exists variant_key text check (variant_key in ('A', 'B') or variant_key is null);

create index if not exists idx_reply_threads_variant_key 
  on public.reply_threads(campaign_id, variant_key) 
  where variant_key is not null;

-- 4. Enable RLS on sequence_step_variants
alter table public.sequence_step_variants enable row level security;

-- RLS policies: Users can access variants for steps in campaigns they own or have access to
create policy if not exists "sequence_step_variants_select" on public.sequence_step_variants
  for select
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = sequence_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "sequence_step_variants_insert" on public.sequence_step_variants
  for insert
  with check (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = sequence_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "sequence_step_variants_update" on public.sequence_step_variants
  for update
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = sequence_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "sequence_step_variants_delete" on public.sequence_step_variants
  for delete
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = sequence_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- 5. Helper function: Get variant content for a step
-- Returns the subject and body for a given variant, or the step's default if variant doesn't exist
create or replace function public.get_step_variant_content(
  p_step_id uuid,
  p_variant_key text
)
returns table (
  subject text,
  body text
)
language sql
stable
as $$
  select 
    coalesce(v.subject, cs.subject_template) as subject,
    coalesce(v.body, cs.body_html_template) as body
  from public.campaign_steps cs
  left join public.sequence_step_variants v 
    on v.step_id = cs.id 
    and v.variant_key = p_variant_key
  where cs.id = p_step_id;
$$;

comment on table public.sequence_step_variants is 'A/B testing variants for campaign steps (Block 10300)';
comment on column public.campaign_steps.has_variants is 'Whether this step has A/B variants enabled';
comment on column public.messages.variant_key is 'Which variant (A or B) was sent for this message';

