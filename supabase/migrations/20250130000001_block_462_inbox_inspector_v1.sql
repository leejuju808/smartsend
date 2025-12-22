-- Block 462 — Inbox Inspector v1
-- Deep Technical Deliverability Diagnostics • DNS Scanner • Reputation Monitor • Fix Recommendations

-- ============================================
-- 1) Inbox Inspector Reports Table
-- ============================================
create table if not exists public.inbox_inspector_reports (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Health Score (0-100)
  health_score int not null default 50 check (health_score >= 0 and health_score <= 100),
  health_status text not null default 'unknown' check (health_status in ('healthy', 'warning', 'critical', 'unknown')),
  
  -- DNS Validation Results
  dns_spf_valid boolean default false,
  dns_spf_record text,
  dns_spf_issues text[],
  dns_dkim_valid boolean default false,
  dns_dkim_selector text,
  dns_dkim_record text,
  dns_dkim_issues text[],
  dns_dmarc_valid boolean default false,
  dns_dmarc_policy text, -- 'none', 'quarantine', 'reject'
  dns_dmarc_record text,
  dns_dmarc_aggregate_reports boolean default false,
  dns_dmarc_issues text[],
  dns_mx_valid boolean default false,
  dns_mx_records text[],
  dns_mx_issues text[],
  dns_a_valid boolean default false,
  dns_a_records text[],
  dns_ptr_valid boolean default false,
  dns_ptr_record text,
  dns_bimi_exists boolean default false,
  dns_bimi_record text,
  
  -- Reputation Checks
  blacklist_status jsonb default '{}'::jsonb, -- {spamhaus: 'clean', barracuda: 'clean', ...}
  spam_trap_probability numeric default 0 check (spam_trap_probability >= 0 and spam_trap_probability <= 1),
  domain_age_days int,
  recent_bounce_risk numeric default 0,
  predicted_spam_risk numeric default 0,
  
  -- Inbox Health Metrics
  warmup_stage text,
  daily_send_volume int default 0,
  spam_complaint_rate numeric default 0,
  bounce_rate numeric default 0,
  engagement_open_rate numeric default 0,
  engagement_click_rate numeric default 0,
  engagement_trend text check (engagement_trend in ('improving', 'stable', 'declining')),
  prediction_risk_signals jsonb default '{}'::jsonb,
  
  -- Report Metadata
  checked_at timestamptz default now(),
  next_check_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(inbox_id)
);

create index if not exists idx_inbox_inspector_reports_workspace on public.inbox_inspector_reports(workspace_id);
create index if not exists idx_inbox_inspector_reports_inbox on public.inbox_inspector_reports(inbox_id);
create index if not exists idx_inbox_inspector_reports_health on public.inbox_inspector_reports(health_score, health_status);
create index if not exists idx_inbox_inspector_reports_checked on public.inbox_inspector_reports(checked_at desc);

-- ============================================
-- 2) Domain Inspector Reports Table
-- ============================================
create table if not exists public.domain_inspector_reports (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.sender_domains(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Domain Intelligence
  domain_age_days int,
  blacklist_status jsonb default '{}'::jsonb,
  recent_bounce_trend numeric default 0, -- percentage change last 7 days
  predicted_risk jsonb default '{}'::jsonb, -- from predictions engine
  
  -- Reputation Signals
  negative_engagement_rate numeric default 0,
  low_open_rate_trend boolean default false,
  reply_to_send_ratio numeric default 0,
  domain_segmentation_performance jsonb default '{}'::jsonb,
  inbox_overload_risk boolean default false,
  
  -- Report Metadata
  checked_at timestamptz default now(),
  next_check_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(domain_id)
);

create index if not exists idx_domain_inspector_reports_workspace on public.domain_inspector_reports(workspace_id);
create index if not exists idx_domain_inspector_reports_domain on public.domain_inspector_reports(domain_id);
create index if not exists idx_domain_inspector_reports_checked on public.domain_inspector_reports(checked_at desc);

-- ============================================
-- 3) Inspector Fix Recommendations Table
-- ============================================
create table if not exists public.inspector_fixes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inbox_id uuid references public.sender_inboxes(id) on delete cascade,
  domain_id uuid references public.sender_domains(id) on delete cascade,
  
  fix_type text not null check (fix_type in (
    'spf', 'dkim', 'dmarc', 'mx', 'ptr', 'bimi',
    'bounce', 'spam', 'engagement', 'template', 'warmup', 'routing'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  ai_recommendation text,
  fix_instructions text,
  auto_fixable boolean default false,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed', 'failed')),
  
  applied_at timestamptz,
  applied_by uuid references auth.users(id),
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id),
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_inspector_fixes_workspace on public.inspector_fixes(workspace_id);
create index if not exists idx_inspector_fixes_inbox on public.inspector_fixes(inbox_id);
create index if not exists idx_inspector_fixes_domain on public.inspector_fixes(domain_id);
create index if not exists idx_inspector_fixes_status on public.inspector_fixes(status);
create index if not exists idx_inspector_fixes_type on public.inspector_fixes(fix_type);

-- ============================================
-- 4) Function to Calculate Inbox Health Score
-- ============================================
create or replace function public.calculate_inbox_health_score(
  p_inbox_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int := 50;
  v_dns_score int := 0;
  v_reputation_score int := 0;
  v_engagement_score int := 0;
  v_warmup_score int := 0;
  v_prediction_score int := 0;
  
  v_report record;
  v_health record;
  v_warmup_status record;
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_open_rate numeric;
  v_click_rate numeric;
begin
  -- Get latest inspector report
  select * into v_report
  from public.inbox_inspector_reports
  where inbox_id = p_inbox_id
  order by checked_at desc
  limit 1;
  
  -- Get inbox health metrics
  select * into v_health
  from public.inbox_health
  where inbox_id = p_inbox_id
  order by updated_at desc
  limit 1;
  
  -- Get warmup status
  select * into v_warmup_status
  from public.inbox_warmup_status
  where inbox_id = p_inbox_id;
  
  -- DNS Score (0-30 points)
  if v_report.dns_spf_valid then v_dns_score := v_dns_score + 5; end if;
  if v_report.dns_dkim_valid then v_dns_score := v_dns_score + 5; end if;
  if v_report.dns_dmarc_valid then v_dns_score := v_dns_score + 5; end if;
  if v_report.dns_mx_valid then v_dns_score := v_dns_score + 5; end if;
  if v_report.dns_ptr_valid then v_dns_score := v_dns_score + 5; end if;
  if v_report.dns_bimi_exists then v_dns_score := v_dns_score + 5; end if;
  
  -- Reputation Score (0-25 points)
  v_reputation_score := 25;
  if v_report.blacklist_status::text like '%listed%' then
    v_reputation_score := v_reputation_score - 10;
  end if;
  if v_report.spam_trap_probability > 0.1 then
    v_reputation_score := v_reputation_score - 5;
  end if;
  if coalesce(v_report.recent_bounce_risk, 0) > 0.05 then
    v_reputation_score := v_reputation_score - 5;
  end if;
  if coalesce(v_report.predicted_spam_risk, 0) > 0.02 then
    v_reputation_score := v_reputation_score - 5;
  end if;
  v_reputation_score := greatest(0, v_reputation_score);
  
  -- Engagement Score (0-25 points)
  v_bounce_rate := coalesce(v_health.bounce_rate, coalesce(v_report.bounce_rate, 0));
  v_spam_rate := coalesce(v_health.spam_rate, coalesce(v_report.spam_complaint_rate, 0));
  v_open_rate := coalesce(v_health.open_rate, coalesce(v_report.engagement_open_rate, 0));
  v_click_rate := coalesce(v_health.click_rate, coalesce(v_report.engagement_click_rate, 0));
  
  v_engagement_score := 25;
  v_engagement_score := v_engagement_score - (v_bounce_rate * 100 * 2); -- -2 per 1% bounce
  v_engagement_score := v_engagement_score - (v_spam_rate * 100 * 5); -- -5 per 1% spam
  v_engagement_score := v_engagement_score + (v_open_rate * 15); -- +15 for 100% open
  v_engagement_score := v_engagement_score + (v_click_rate * 10); -- +10 for 100% click
  v_engagement_score := greatest(0, least(25, v_engagement_score));
  
  -- Warmup Score (0-10 points)
  if v_warmup_status is not null then
    if v_warmup_status.warmup_stage = 'stage_4' then
      v_warmup_score := 10;
    elsif v_warmup_status.warmup_stage = 'stage_3' then
      v_warmup_score := 7;
    elsif v_warmup_status.warmup_stage = 'stage_2' then
      v_warmup_score := 4;
    elsif v_warmup_status.warmup_stage = 'stage_1' then
      v_warmup_score := 2;
    end if;
  end if;
  
  -- Prediction Score (0-10 points)
  if v_report.prediction_risk_signals is not null then
    if v_report.prediction_risk_signals::text not like '%high%' and 
       v_report.prediction_risk_signals::text not like '%critical%' then
      v_prediction_score := 10;
    elsif v_report.prediction_risk_signals::text like '%high%' then
      v_prediction_score := 5;
    else
      v_prediction_score := 0;
    end if;
  else
    v_prediction_score := 5; -- neutral if no predictions
  end if;
  
  -- Total Score
  v_score := v_dns_score + v_reputation_score + v_engagement_score + v_warmup_score + v_prediction_score;
  v_score := greatest(0, least(100, v_score));
  
  return v_score;
end;
$$;

-- ============================================
-- 5) Function to Update Health Status
-- ============================================
create or replace function public.update_inbox_health_status()
returns trigger
language plpgsql
as $$
declare
  v_score int;
  v_status text;
begin
  v_score := public.calculate_inbox_health_score(new.inbox_id);
  
  if v_score >= 80 then
    v_status := 'healthy';
  elsif v_score >= 60 then
    v_status := 'warning';
  else
    v_status := 'critical';
  end if;
  
  new.health_score := v_score;
  new.health_status := v_status;
  new.updated_at := now();
  
  return new;
end;
$$;

create trigger trg_update_inbox_health_status
before insert or update on public.inbox_inspector_reports
for each row execute function public.update_inbox_health_status();

-- ============================================
-- 6) Enable RLS
-- ============================================
alter table public.inbox_inspector_reports enable row level security;
alter table public.domain_inspector_reports enable row level security;
alter table public.inspector_fixes enable row level security;

-- RLS Policies for inbox_inspector_reports
create policy "inbox_inspector_reports_select_workspace_member" on public.inbox_inspector_reports
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inbox_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "inbox_inspector_reports_insert_workspace_member" on public.inbox_inspector_reports
  for insert with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inbox_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "inbox_inspector_reports_update_workspace_member" on public.inbox_inspector_reports
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inbox_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

-- RLS Policies for domain_inspector_reports
create policy "domain_inspector_reports_select_workspace_member" on public.domain_inspector_reports
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = domain_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "domain_inspector_reports_insert_workspace_member" on public.domain_inspector_reports
  for insert with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = domain_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "domain_inspector_reports_update_workspace_member" on public.domain_inspector_reports
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = domain_inspector_reports.workspace_id
        and user_id = auth.uid()
    )
  );

-- RLS Policies for inspector_fixes
create policy "inspector_fixes_select_workspace_member" on public.inspector_fixes
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inspector_fixes.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "inspector_fixes_insert_workspace_member" on public.inspector_fixes
  for insert with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inspector_fixes.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "inspector_fixes_update_workspace_member" on public.inspector_fixes
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inspector_fixes.workspace_id
        and user_id = auth.uid()
    )
  );

-- ============================================
-- 7) Helper Function to Get Workspace ID from Inbox
-- ============================================
create or replace function public.get_inbox_workspace_id(p_inbox_id uuid)
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.sender_inboxes
  where id = p_inbox_id;
$$;

-- ============================================
-- BLOCK 462 COMPLETE
-- ============================================



