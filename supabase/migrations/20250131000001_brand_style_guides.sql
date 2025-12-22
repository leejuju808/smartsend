-- Brand Style Guides, Phrase Banks, and Preflight Logs
-- Step 1: Brand style guide per account/campaign

create table if not exists public.brand_style_guides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null, -- references profiles.account_id or teams.id
  campaign_id uuid references public.campaigns(id) on delete cascade,
  -- scope: account-wide vs campaign override
  scope text not null default 'account' check (scope in ('account','campaign')),
  voice_principles text,      -- short bullets (e.g., "confident, concise, respectful")
  formatting_rules text,      -- e.g., "no emojis; <=2 paragraphs; 1 CTA"
  length_limits jsonb,        -- { "subject_max": 100, "body_max": 2000 }
  required_tags jsonb,        -- ["{{first_name}}"]
  can_include_links boolean default true
);

create index if not exists ix_bsg_account_campaign on public.brand_style_guides(account_id, campaign_id);

-- Step 2: Allow/Deny phrase banks

create table if not exists public.brand_phrase_bank (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('allow','deny')),  -- allow = preferred words; deny = forbidden
  phrase text not null,
  note text
);

create index if not exists ix_phrase_bank_scope on public.brand_phrase_bank(account_id, campaign_id, kind);

-- Step 3: Preflight results for auditability

create table if not exists public.send_preflight_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  template_id uuid references public.followup_templates(id) on delete set null,
  template_variant_id uuid references public.followup_template_variants(id) on delete set null,
  tone_used text,
  status text not null check (status in ('passed','failed','warn')),
  issues jsonb,        -- [{code,msg,loc}]
  content_hash text    -- to dedupe/replay analysis
);

create index if not exists ix_preflight_logs_campaign on public.send_preflight_logs(campaign_id, created_at);
create index if not exists ix_preflight_logs_content_hash on public.send_preflight_logs(content_hash);

-- RLS policies
alter table public.brand_style_guides enable row level security;
alter table public.brand_phrase_bank enable row level security;
alter table public.send_preflight_logs enable row level security;

-- Brand style guides: users can read/write their own account's guides
create policy brand_style_guides_select on public.brand_style_guides
  for select
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_style_guides_insert on public.brand_style_guides
  for insert
  with check (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_style_guides_update on public.brand_style_guides
  for update
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_style_guides_delete on public.brand_style_guides
  for delete
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

-- Phrase bank: same access pattern
create policy brand_phrase_bank_select on public.brand_phrase_bank
  for select
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_phrase_bank_insert on public.brand_phrase_bank
  for insert
  with check (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_phrase_bank_update on public.brand_phrase_bank
  for update
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy brand_phrase_bank_delete on public.brand_phrase_bank
  for delete
  using (account_id in (
    select account_id from public.profiles where id = auth.uid()
    union
    select team_id from public.team_members where user_id = auth.uid()
  ));

-- Preflight logs: read-only for campaign members
create policy send_preflight_logs_select on public.send_preflight_logs
  for select
  using (
    campaign_id in (
      select id from public.campaigns where user_id = auth.uid()
      union
      select c.id from public.campaigns c
      join public.team_members tm on tm.team_id = c.team_id
      where tm.user_id = auth.uid()
    )
  );

create policy send_preflight_logs_insert on public.send_preflight_logs
  for insert
  with check (true); -- Service role inserts

-- Update trigger for brand_style_guides
create or replace function public.touch_brand_style_guides()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_brand_style_guides_updated_at on public.brand_style_guides;
create trigger trg_brand_style_guides_updated_at
before update on public.brand_style_guides
for each row execute function public.touch_brand_style_guides();

-- Step 6: CAN-SPAM compliance fields on campaigns
alter table public.campaigns
  add column if not exists include_unsubscribe_footer boolean default true,
  add column if not exists include_business_address boolean default true;















