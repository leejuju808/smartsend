-- Track AI rewrite jobs and helper RPC for attaching variants

create table if not exists public.ai_rewrite_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null,
  base_subject text,
  base_body_html text,
  params jsonb not null default '{}'::jsonb,
  outputs jsonb,
  error text
);

create index if not exists idx_ai_jobs_user_time on public.ai_rewrite_jobs(user_id, created_at desc);
create index if not exists idx_ai_jobs_campaign_step on public.ai_rewrite_jobs(campaign_id, step_no, created_at desc);

create or replace function public.attach_rewrite_variant(
  p_campaign uuid,
  p_step_no int,
  p_name text,
  p_subject text,
  p_body_html text,
  p_weight numeric default 0.5
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.campaign_step_variants (
    campaign_id,
    step_no,
    name,
    subject_template,
    body_html_template,
    weight,
    enabled
  )
  values (p_campaign, p_step_no, p_name, p_subject, p_body_html, coalesce(p_weight, 0.5), true)
  on conflict (campaign_id, step_no, name) do update
    set subject_template = excluded.subject_template,
        body_html_template = excluded.body_html_template,
        weight = excluded.weight,
        enabled = true
  returning id into v_id;

  return v_id;
end;
$$;












