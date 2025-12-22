-- email_templates table for user-owned templates
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- template_variants (rewrites)
create table if not exists template_variants (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references email_templates(id) on delete cascade,
  variant_label text not null, -- e.g. "Concise", "Warmer", "Punchy"
  subject text not null,
  body text not null,
  meta jsonb default '{}'::jsonb, -- {score: 0.87, tone:"warm", len:"short"}
  created_at timestamptz default now()
);

-- helpful index
create index if not exists idx_template_variants_template on template_variants(template_id);

-- RLS (if enabled)
alter table email_templates enable row level security;
alter table template_variants enable row level security;

create policy "own templates"
on email_templates for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "variants via parent"
on template_variants for all
using (
  exists (select 1 from email_templates t where t.id = template_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from email_templates t where t.id = template_id and t.user_id = auth.uid())
);

-- updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_email_templates_updated_at
  before update on email_templates
  for each row
  execute function update_updated_at_column();

