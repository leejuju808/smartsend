-- Reply templates for AI-generated drafts
create table if not exists reply_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  intent text not null check (intent in ('interested','meeting','referral','not_now','unsubscribe','question')),
  title text not null,
  body_template text not null,  -- handlebars-like: {{first_name}}, {{company}}, {{link_book}}
  locale text default 'en',
  is_shared boolean default true,
  created_at timestamptz default now()
);

alter table reply_templates enable row level security;

create policy "tenant read/write templates"
on reply_templates
using (workspace_id = (current_setting('request.jwt.claims', true)::jsonb->>'workspace_id')::uuid)
with check (workspace_id = (current_setting('request.jwt.claims', true)::jsonb->>'workspace_id')::uuid);

create index if not exists idx_reply_templates_workspace_intent on reply_templates(workspace_id, intent);

-- Workspace settings (signature, booking link, etc.)
create table if not exists workspace_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  sender_name text,
  signature_html text,
  booking_link text,
  product_value_props jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table workspace_settings enable row level security;
create policy "tenant rw settings" on workspace_settings
using (workspace_id = (current_setting('request.jwt.claims', true)::jsonb->>'workspace_id')::uuid)
with check (workspace_id = (current_setting('request.jwt.claims', true)::jsonb->>'workspace_id')::uuid);

-- Seed default template for one workspace (optional)
insert into reply_templates (workspace_id,intent,title,body_template,is_shared)
select w.id, 'meeting', 'Propose 2 times',
'Hi {{first_name}},  

Great to hear back. I can do {{time_option_1}} or {{time_option_2}}.  
If either works, I''ll send a calendar invite.  
Alternatively, book here: {{link_book}}

Best,  
{{signature}}', true
from workspaces w
limit 1
on conflict do nothing;

