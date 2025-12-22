-- Smart Replies System: presets, suggestions, and analytics

-- 1) Optional presets you can curate per org (editable later in settings)
create table if not exists reply_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  label text not null,     -- e.g., "Interested", "Not now"
  body text not null,      -- default/template body with {{merge_tags}}
  is_active boolean not null default true,
  created_at timestamptz default now()
);

alter table reply_presets enable row level security;
create policy "read presets in org" on reply_presets for select using (is_org_member(org_id));
create policy "write presets in org" on reply_presets for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- 2) Log what suggestion was shown/chosen for training/analytics
create table if not exists reply_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  email_thread_id text,            -- provider thread/conversation id if you have it
  suggested jsonb not null,        -- [{label, body, source:"ai|preset"}]
  chosen_label text,               -- set when user picks one
  chosen_body text,                -- set when user picks one
  sent boolean default false,      -- flips true on successful send
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table reply_suggestions enable row level security;
create policy "read suggestions in org" on reply_suggestions for select using (is_org_member(org_id));
create policy "write suggestions in org" on reply_suggestions for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- 3) Outcome tagging for analytics
alter table leads add column if not exists outcome text
  check (outcome in ('interested','meeting_set','pricing_sent','not_now','not_fit','opt_out')); 

-- Create indexes
create index if not exists idx_reply_presets_org on reply_presets(org_id);
create index if not exists idx_reply_suggestions_org on reply_suggestions(org_id);
create index if not exists idx_reply_suggestions_lead on reply_suggestions(lead_id);
create index if not exists idx_reply_suggestions_campaign on reply_suggestions(campaign_id);
create index if not exists idx_leads_outcome on leads(outcome);

-- 4) Add action column if needed for campaign_logs
-- Note: campaign_logs table already exists and we'll use action='smart_reply_sent'
-- Ensure action column exists
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'campaign_logs' and column_name = 'action') then
    alter table campaign_logs add column action text;
  end if;
end $$;

