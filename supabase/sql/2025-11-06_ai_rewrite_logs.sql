create table if not exists public.ai_rewrite_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null,
  variant_id uuid references public.campaign_step_variants(id) on delete set null,
  tone text,
  length_hint text,
  temperature numeric,
  input_subject text,
  input_body_html text,
  output_subject text,
  output_body_html text
);

alter table public.ai_rewrite_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'rewrites by self') then
    create policy "rewrites by self" on public.ai_rewrite_logs for select using (user_id = auth.uid());
    create policy "rewrites insert self" on public.ai_rewrite_logs for insert with check (user_id = auth.uid());
  end if;
end
$$;











