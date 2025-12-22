-- Block 11700 — Email Warmup Simulator v1
-- Deliverability Checker + Spam Risk Score + Fix Recommendations
-- 
-- This migration adds warmup risk tracking to sending identities and content risk analysis to campaign steps

-- ============================================================================
-- 1. EXTEND connected_accounts WITH WARMUP RISK FIELDS
-- ============================================================================

-- Add domain column if it doesn't exist (extracted from email_address)
alter table public.connected_accounts
  add column if not exists domain text;

-- Extract domain from email_address if domain is null
update public.connected_accounts
set domain = split_part(coalesce(email_address, account_email, email), '@', 2)
where domain is null;

-- Add warmup risk tracking columns
alter table public.connected_accounts
  add column if not exists last_risk_score int check (last_risk_score between 0 and 100),
  add column if not exists last_risk_reason jsonb default '{}'::jsonb,
  add column if not exists last_risk_checked_at timestamptz,
  add column if not exists suggested_daily_limit int;

-- Create index for risk score queries
create index if not exists idx_connected_accounts_risk_score 
  on public.connected_accounts(last_risk_score) 
  where last_risk_score is not null;

-- ============================================================================
-- 2. ADD CONTENT RISK ANALYSIS TO campaign_steps
-- ============================================================================

alter table public.campaign_steps
  add column if not exists content_risk jsonb default '{}'::jsonb;

-- Example structure for content_risk:
-- {
--   "links": 2,
--   "images": 0,
--   "spammy_terms": [],
--   "all_caps_subject": false,
--   "exclamation_count": 0,
--   "last_analyzed_at": "2025-01-30T00:00:00Z"
-- }

-- ============================================================================
-- 3. CREATE FUNCTION TO EXTRACT DOMAIN FROM EMAIL
-- ============================================================================

create or replace function public.extract_domain_from_email(email_text text)
returns text
language plpgsql
immutable
as $$
begin
  return split_part(email_text, '@', 2);
end;
$$;

-- ============================================================================
-- 4. CREATE FUNCTION TO CALCULATE VOLUME STATS
-- ============================================================================

-- Helper function to get sending volume stats for an email identity
create or replace function public.get_sending_volume_stats(
  p_email_address text,
  p_workspace_id uuid default null
)
returns table (
  last_24h bigint,
  last_7d bigint,
  last_30d bigint
)
language plpgsql
stable
as $$
declare
  v_24h_start timestamptz := now() - interval '24 hours';
  v_7d_start timestamptz := now() - interval '7 days';
  v_30d_start timestamptz := now() - interval '30 days';
begin
  return query
  select
    (select count(*)::bigint 
     from public.send_queue sq
     join public.connected_accounts ca on sq.account_id = ca.id
     where (ca.email_address = p_email_address or ca.account_email = p_email_address)
       and sq.sent_at >= v_24h_start
       and (p_workspace_id is null or ca.workspace_id = p_workspace_id)
    ) as last_24h,
    (select count(*)::bigint 
     from public.send_queue sq
     join public.connected_accounts ca on sq.account_id = ca.id
     where (ca.email_address = p_email_address or ca.account_email = p_email_address)
       and sq.sent_at >= v_7d_start
       and (p_workspace_id is null or ca.workspace_id = p_workspace_id)
    ) as last_7d,
    (select count(*)::bigint 
     from public.send_queue sq
     join public.connected_accounts ca on sq.account_id = ca.id
     where (ca.email_address = p_email_address or ca.account_email = p_email_address)
       and sq.sent_at >= v_30d_start
       and (p_workspace_id is null or ca.workspace_id = p_workspace_id)
    ) as last_30d;
end;
$$;

-- ============================================================================
-- 5. CREATE FUNCTION TO ANALYZE CONTENT RISK
-- ============================================================================

create or replace function public.analyze_content_risk(
  p_subject text,
  p_body_html text default null,
  p_body_text text default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_body_content text := coalesce(p_body_html, p_body_text, '');
  v_link_count int := 0;
  v_image_count int := 0;
  v_spammy_terms text[] := array[]::text[];
  v_all_caps_subject boolean := false;
  v_exclamation_count int := 0;
  v_spammy_patterns text[] := array[
    'free', 'earn', 'guaranteed', 'win money', 'act now', 'limited time',
    'click here', 'buy now', 'no credit check', 'make money', 'work from home',
    '$$$', '!!!', 'urgent', 'asap', 'congratulations', 'winner'
  ];
begin
  -- Count links (basic regex for href)
  select count(*) into v_link_count
  from regexp_split_to_table(v_body_content, '<a[^>]*href', 'gi')
  where true;
  
  -- Count images
  select count(*) into v_image_count
  from regexp_split_to_table(v_body_content, '<img', 'gi')
  where true;
  
  -- Check for ALL CAPS in subject (excluding short subjects)
  if length(p_subject) > 5 then
    v_all_caps_subject := upper(p_subject) = p_subject and p_subject ~ '[A-Z]';
  end if;
  
  -- Count exclamation marks in subject
  v_exclamation_count := length(p_subject) - length(replace(p_subject, '!', ''));
  
  -- Check for spammy terms (case insensitive)
  select array_agg(term) into v_spammy_terms
  from unnest(v_spammy_patterns) as term
  where lower(coalesce(p_subject, '') || ' ' || lower(v_body_content)) like '%' || lower(term) || '%';
  
  -- Build result JSONB
  v_result := jsonb_build_object(
    'links', v_link_count,
    'images', v_image_count,
    'spammy_terms', coalesce(v_spammy_terms, array[]::text[]),
    'all_caps_subject', v_all_caps_subject,
    'exclamation_count', v_exclamation_count,
    'last_analyzed_at', now()::text
  );
  
  return v_result;
end;
$$;

-- ============================================================================
-- 6. CREATE FUNCTION TO CALCULATE RISK SCORE
-- ============================================================================

create or replace function public.calculate_warmup_risk_score(
  p_dns_status jsonb default '{}'::jsonb,
  p_volume_stats jsonb default '{}'::jsonb,
  p_content_risk jsonb default '{}'::jsonb,
  p_domain_age_days int default null,
  p_is_new_domain boolean default false
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_score int := 80; -- Base score
  v_reasons jsonb := '[]'::jsonb;
  v_penalty int;
  v_volume_24h int := (p_volume_stats->>'last_24h')::int;
  v_volume_7d int := (p_volume_stats->>'last_7d')::int;
  v_volume_30d int := (p_volume_stats->>'last_30d')::int;
  v_link_count int := (p_content_risk->>'links')::int;
  v_all_caps boolean := coalesce((p_content_risk->>'all_caps_subject')::boolean, false);
  v_spammy_terms text[] := coalesce((p_content_risk->>'spammy_terms')::text[], array[]::text[]);
begin
  -- DNS penalties
  if not coalesce((p_dns_status->>'has_spf')::boolean, false) then
    v_penalty := 15;
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'missing_spf',
      'label', 'SPF record missing',
      'severity', 'high',
      'penalty', v_penalty
    );
  end if;
  
  if not coalesce((p_dns_status->>'has_dkim')::boolean, false) then
    v_penalty := 20;
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'missing_dkim',
      'label', 'DKIM record missing',
      'severity', 'high',
      'penalty', v_penalty
    );
  end if;
  
  if not coalesce((p_dns_status->>'has_dmarc')::boolean, false) then
    v_penalty := 10;
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'missing_dmarc',
      'label', 'DMARC record missing',
      'severity', 'medium',
      'penalty', v_penalty
    );
  end if;
  
  -- Volume penalties
  if p_is_new_domain or (p_domain_age_days is not null and p_domain_age_days < 30) then
    if v_volume_24h > 200 then
      v_penalty := 15;
      v_score := v_score - v_penalty;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'high_volume_new_domain',
        'label', format('Sending %s emails/day from a new domain (<30 days)', v_volume_24h),
        'severity', 'high',
        'penalty', v_penalty
      );
    end if;
  end if;
  
  -- Volume jump penalty (doubled vs last week)
  if v_volume_7d > 0 and v_volume_30d > 0 then
    if (v_volume_7d::float / nullif(v_volume_30d - v_volume_7d, 0)) > 1.5 then
      v_penalty := 10;
      v_score := v_score - v_penalty;
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'volume_jump',
        'label', 'Sending volume increased significantly vs previous period',
        'severity', 'medium',
        'penalty', v_penalty
      );
    end if;
  end if;
  
  -- Content penalties
  if v_link_count > 3 then
    v_penalty := 5;
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'too_many_links',
      'label', format('Email contains %s links (recommended: ≤3)', v_link_count),
      'severity', 'low',
      'penalty', v_penalty
    );
  end if;
  
  if v_all_caps then
    v_penalty := 10;
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'all_caps_subject',
      'label', 'Subject line is ALL CAPS',
      'severity', 'medium',
      'penalty', v_penalty
    );
  end if;
  
  if array_length(v_spammy_terms, 1) > 0 then
    v_penalty := least(15, array_length(v_spammy_terms, 1) * 5);
    v_score := v_score - v_penalty;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'spammy_terms',
      'label', format('Subject/body contains spammy terms: %s', array_to_string(v_spammy_terms, ', ')),
      'severity', 'medium',
      'penalty', v_penalty
    );
  end if;
  
  -- Clamp score to 0-100
  v_score := greatest(0, least(100, v_score));
  
  -- Determine risk level
  return jsonb_build_object(
    'score', v_score,
    'risk_level', case
      when v_score < 40 then 'high'
      when v_score < 70 then 'medium'
      else 'low'
    end,
    'reasons', v_reasons,
    'base_score', 80,
    'final_score', v_score
  );
end;
$$;

-- ============================================================================
-- 7. CREATE FUNCTION TO GET RECOMMENDATIONS
-- ============================================================================

create or replace function public.get_warmup_recommendations(
  p_reasons jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_recommendations jsonb := '[]'::jsonb;
  v_reason jsonb;
begin
  for v_reason in select * from jsonb_array_elements(p_reasons)
  loop
    case (v_reason->>'code')
      when 'missing_spf' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'add_spf',
          'label', 'Add SPF record to your DNS',
          'description', 'SPF (Sender Policy Framework) helps prevent email spoofing. Add a TXT record to your domain DNS.',
          'priority', 'high',
          'link', 'https://docs.smartsend.ai/dns/spf-setup'
        );
      when 'missing_dkim' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'add_dkim',
          'label', 'Add DKIM record to your DNS',
          'description', 'DKIM (DomainKeys Identified Mail) adds cryptographic signatures to your emails for better deliverability.',
          'priority', 'high',
          'link', 'https://docs.smartsend.ai/dns/dkim-setup'
        );
      when 'missing_dmarc' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'add_dmarc',
          'label', 'Add DMARC record to your DNS',
          'description', 'DMARC (Domain-based Message Authentication) provides additional email authentication and reporting.',
          'priority', 'medium',
          'link', 'https://docs.smartsend.ai/dns/dmarc-setup'
        );
      when 'high_volume_new_domain' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'lower_send_volume',
          'label', 'Reduce daily send volume for new domain',
          'description', 'New domains need gradual warmup. Start with 30-50 emails/day, then gradually increase.',
          'priority', 'high',
          'warmup_schedule', jsonb_build_object(
            'day_1_2', 30,
            'day_3_4', 60,
            'day_5_7', 100,
            'day_8_14', 200,
            'day_15_plus', 500
          )
        );
      when 'volume_jump' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'gradual_increase',
          'label', 'Gradually increase sending volume',
          'description', 'Avoid sudden spikes in volume. Increase by no more than 20% per day.',
          'priority', 'medium'
        );
      when 'too_many_links' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'reduce_links',
          'label', 'Reduce number of links in email',
          'description', 'Emails with too many links can trigger spam filters. Keep it to 1-3 links maximum.',
          'priority', 'low'
        );
      when 'all_caps_subject' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'fix_subject_caps',
          'label', 'Avoid ALL CAPS in subject line',
          'description', 'Use normal capitalization. Example: "Quick question about your roof in {{city}}" instead of "QUICK QUESTION!!!"',
          'priority', 'medium'
        );
      when 'spammy_terms' then
        v_recommendations := v_recommendations || jsonb_build_object(
          'code', 'avoid_spammy_terms',
          'label', 'Remove spammy words from subject/body',
          'description', 'Avoid words like "free", "guaranteed", "act now", "$$$", etc. Use natural, conversational language.',
          'priority', 'medium'
        );
    end case;
  end loop;
  
  return v_recommendations;
end;
$$;

-- ============================================================================
-- 8. CREATE RPC FUNCTION FOR WARMUP CHECK
-- ============================================================================

create or replace function public.run_warmup_check(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_account record;
  v_domain text;
  v_dns_status jsonb := '{}'::jsonb;
  v_volume_stats jsonb;
  v_content_risk jsonb := '{}'::jsonb;
  v_risk_result jsonb;
  v_recommendations jsonb;
  v_email_address text;
  v_suggested_limit int;
begin
  -- Get account details
  select 
    id,
    coalesce(email_address, account_email, email) as email,
    domain,
    workspace_id,
    created_at
  into v_account
  from public.connected_accounts
  where id = p_account_id;
  
  if not found then
    return jsonb_build_object('error', 'Account not found');
  end if;
  
  v_email_address := v_account.email;
  v_domain := coalesce(v_account.domain, public.extract_domain_from_email(v_email_address));
  
  -- TODO: DNS check would be implemented via external service or edge function
  -- For now, return placeholder (will be implemented in API layer)
  v_dns_status := jsonb_build_object(
    'has_spf', false,
    'has_dkim', false,
    'has_dmarc', false,
    'checked_at', now()::text
  );
  
  -- Get volume stats
  select jsonb_build_object(
    'last_24h', last_24h,
    'last_7d', last_7d,
    'last_30d', last_30d
  ) into v_volume_stats
  from public.get_sending_volume_stats(v_email_address, v_account.workspace_id);
  
  -- Calculate risk score
  v_risk_result := public.calculate_warmup_risk_score(
    p_dns_status := v_dns_status,
    p_volume_stats := v_volume_stats,
    p_content_risk := v_content_risk,
    p_domain_age_days := extract(day from (now() - v_account.created_at)),
    p_is_new_domain := (now() - v_account.created_at) < interval '30 days'
  );
  
  -- Get recommendations
  v_recommendations := public.get_warmup_recommendations(v_risk_result->'reasons');
  
  -- Calculate suggested daily limit based on risk
  v_suggested_limit := case
    when (v_risk_result->>'risk_level') = 'high' then 50
    when (v_risk_result->>'risk_level') = 'medium' then 100
    else 200
  end;
  
  -- Update account with risk data
  update public.connected_accounts
  set
    last_risk_score = (v_risk_result->>'score')::int,
    last_risk_reason = jsonb_build_object(
      'dns_status', v_dns_status,
      'volume_stats', v_volume_stats,
      'reasons', v_risk_result->'reasons'
    ),
    last_risk_checked_at = now(),
    suggested_daily_limit = v_suggested_limit,
    domain = v_domain
  where id = p_account_id;
  
  -- Return full result
  return jsonb_build_object(
    'score', (v_risk_result->>'score')::int,
    'risk_level', v_risk_result->>'risk_level',
    'reasons', v_risk_result->'reasons',
    'recommendations', v_recommendations,
    'suggested_daily_limit', v_suggested_limit,
    'dns_status', v_dns_status,
    'volume_stats', v_volume_stats,
    'checked_at', now()::text
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.run_warmup_check(uuid) to authenticated;
grant execute on function public.get_sending_volume_stats(text, uuid) to authenticated;
grant execute on function public.analyze_content_risk(text, text, text) to authenticated;
grant execute on function public.calculate_warmup_risk_score(jsonb, jsonb, jsonb, int, boolean) to authenticated;
grant execute on function public.get_warmup_recommendations(jsonb) to authenticated;





























































