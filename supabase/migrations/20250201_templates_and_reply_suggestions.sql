-- User/team templates you can reuse across threads
create table if not exists public.templates (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  body text not null,             -- can contain {{first_name}}, {{company}}, {{position}}, {{last_email_summary}}
  created_at timestamptz default now()
);

-- Log suggestions (for analytics / training)
create table if not exists public.reply_suggestions (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid,
  variant smallint,                -- 1..3
  prompt jsonb,                    -- controls used
  output text,
  created_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_templates_owner_user_id on public.templates(owner_user_id);
create index if not exists idx_reply_suggestions_thread_id on public.reply_suggestions(thread_id);
create index if not exists idx_reply_suggestions_created_at on public.reply_suggestions(created_at);

-- Enable RLS
alter table public.templates enable row level security;
alter table public.reply_suggestions enable row level security;

-- RLS Policies for templates
create policy if not exists "Users can view their own templates"
  on public.templates for select
  using (auth.uid() = owner_user_id);

create policy if not exists "Users can insert their own templates"
  on public.templates for insert
  with check (auth.uid() = owner_user_id);

create policy if not exists "Users can update their own templates"
  on public.templates for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy if not exists "Users can delete their own templates"
  on public.templates for delete
  using (auth.uid() = owner_user_id);

-- RLS Policies for reply_suggestions
create policy if not exists "Users can insert reply suggestions"
  on public.reply_suggestions for insert
  with check (true);

create policy if not exists "Users can view reply suggestions"
  on public.reply_suggestions for select
  using (true);

