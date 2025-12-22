-- Templates and Template Variants for Rewriter System
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists template_variants (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  subject text not null,
  body text not null,
  tone text,
  length text,
  created_at timestamptz default now()
);

alter table templates enable row level security;
alter table template_variants enable row level security;

create policy "owner templates" on templates
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner variants" on template_variants
for all to authenticated using (
  exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid())
);

