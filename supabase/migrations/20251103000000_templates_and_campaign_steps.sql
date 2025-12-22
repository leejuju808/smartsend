-- Templates (re-usable email content)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  body text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_templates_user on public.templates(user_id);

-- Enable RLS
alter table public.templates enable row level security;

-- RLS policies for templates
create policy if not exists "templates_select_own" on public.templates 
  for select using (auth.uid() = user_id);

create policy if not exists "templates_insert_own" on public.templates 
  for insert with check (auth.uid() = user_id);

create policy if not exists "templates_update_own" on public.templates 
  for update using (auth.uid() = user_id);

create policy if not exists "templates_delete_own" on public.templates 
  for delete using (auth.uid() = user_id);

-- Steps (ordered sequence inside a campaign)
create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_number int not null,
  template_id uuid references public.templates(id) on delete set null,
  delay_days int default 0,
  mailbox_id uuid references public.connected_accounts(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campaign_id, step_number)
);

create index if not exists idx_campaign_steps_campaign on public.campaign_steps(campaign_id);
create index if not exists idx_campaign_steps_template on public.campaign_steps(template_id);

-- Enable RLS
alter table public.campaign_steps enable row level security;

-- RLS policies for campaign_steps
-- Users can access campaign_steps if they can access the campaign
create policy if not exists "campaign_steps_select" on public.campaign_steps
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "campaign_steps_modify" on public.campaign_steps
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );





