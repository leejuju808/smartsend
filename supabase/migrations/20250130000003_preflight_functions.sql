-- Preflight System: Core evaluator functions (server-side, deterministic)

-- Utility: extract all link hostnames from HTML (basic)
create or replace function public.extract_link_hosts(p_html text)
returns text[] language plpgsql immutable as $$
declare
  hosts text[];
  m text;
  h text;
begin
  hosts := '{}';
  if p_html is null then return hosts; end if;
  
  -- naive parse: find 'href="..."'
  for m in select unnest(regexp_matches(p_html, 'href=["'']([^"'']+)["'']', 'gi')) loop
    h := lower(split_part(regexp_replace(m, '^https?://', '', 'i'), '/', 1));
    if position('@' in h) > 0 then h := split_part(h, '@', 2); end if; -- strip user@
    hosts := array_append(hosts, h);
  end loop;
  
  return hosts;
end $$;

-- Utility: is shortened URL host?
create or replace function public.is_shortener(host text)
returns boolean language sql immutable as $$
  select lower(host) in (
    'bit.ly','t.co','goo.gl','tinyurl.com','rb.gy','rebrand.ly','cutt.ly','ow.ly','is.gd','s.id'
  )
$$;

-- Utility: strip HTML to rough text length
create or replace function public.html_text_len(p_html text)
returns int language sql immutable as $$
  select length(regexp_replace(coalesce(p_html,''), '<[^>]*>', '', 'g'))
$$;

-- Main evaluator: returns decision, score, reasons, details
create or replace function public.preflight_evaluate_row(p_queue_id uuid)
returns table(decision preflight_decision, score int, reasons text[], details jsonb)
language plpgsql
stable
as $$
declare
  q record;
  score int := 100;
  reasons text[] := ARRAY['ok'];
  hosts text[];
  link_count int := 0;
  short_detected boolean := false;
  spam_hit boolean := false;
  all_caps boolean := false;
  text_len int := 0;
  acct_age_days int := 9999;
  ramp_limit int := 999999;
  sent_today int := 0;
  warmup_on boolean := true;
  acct_profile record;
  sender_domain text;
  dh record;
  bad_domain boolean := false;
  blocked_domain boolean := false;
  allow_domain boolean := false;
  h text;
begin
  select * into q from public.send_queue where id = p_queue_id limit 1;
  
  if not found then
    return query select 'block'::preflight_decision, 0, ARRAY['missing_from'], jsonb_build_object('error','queue_row_not_found');
    return;
  end if;

  -- sender's domain (check various possible column names)
  sender_domain := nullif(split_part(coalesce(
    q.from_address,
    q.sender_email,
    q.from_email,
    (select email_address from public.accounts where id = q.account_id limit 1),
    ''
  ),'@',2),'');

  -- Warmup policy
  select * into acct_profile from public.account_warmup_profiles where account_id = q.account_id;
  if found then warmup_on := acct_profile.enabled; end if;

  -- Account age calculation
  select greatest(0, extract(day from (now() - coalesce(
    (select created_at from public.accounts where id=q.account_id limit 1), 
    now()
  ))))::int into acct_age_days;

  if warmup_on and found then
    ramp_limit := least(
      coalesce(acct_profile.daily_ramp_cap, 300),
      coalesce(acct_profile.daily_ramp_start,30) + (acct_age_days * coalesce(acct_profile.daily_ramp_increment,30))
    );
    
    -- today's sent count
    select coalesce(sum(1),0) into sent_today
    from public.send_queue
    where account_id = q.account_id 
      and status='sent' 
      and sent_at::date = current_date;
      
    if sent_today >= ramp_limit then
      reasons := reasons || 'warmup_gate';
      score := score - 30;
    end if;
  end if;

  -- Content/links
  hosts := public.extract_link_hosts(q.body_html);
  link_count := coalesce(array_length(hosts,1),0);
  if link_count > 6 then 
    reasons := reasons || 'too_many_links'; 
    score := score - 20; 
  end if;

  if link_count > 0 then
    foreach h in array hosts loop
      if public.is_shortener(h) then short_detected := true; end if;
      
      -- account block/allow lists
      if exists (
        select 1 from public.preflight_rules r 
        where r.account_id=q.account_id 
          and r.kind='block_link_domain' 
          and r.value=h
      ) then
        blocked_domain := true;
      end if;
      
      if exists (
        select 1 from public.preflight_rules r 
        where r.account_id=q.account_id 
          and r.kind='allow_link_domain' 
          and r.value=h
      ) then
        allow_domain := true;
      end if;
      
      -- global/domain health
      select * into dh from public.domain_health where domain = h;
      if found then
        if dh.shortener = true then short_detected := true; end if;
        if dh.blocklisted = true or dh.reputation = 'bad' then
          bad_domain := true;
        end if;
      end if;
    end loop;
  end if;

  if short_detected then 
    reasons := reasons || 'short_url_detected'; 
    score := score - 15; 
  end if;
  
  if blocked_domain then 
    reasons := reasons || 'domain_blocklisted'; 
    score := score - 40; 
  end if;
  
  if bad_domain and not allow_domain then 
    reasons := reasons || 'domain_unhealthy'; 
    score := score - 25; 
  end if;

  -- Subject style
  all_caps := coalesce(q.subject,'') <> '' 
    and (q.subject = upper(q.subject)) 
    and length(q.subject) >= 6;
  if all_caps then 
    reasons := reasons || 'all_caps_subject'; 
    score := score - 10; 
  end if;

  -- Spam phrases (per-account)
  if exists (
    select 1 from public.preflight_rules r
    where r.account_id = q.account_id 
      and r.kind='spam_phrase'
      and (
        lower(coalesce(q.subject,'')) like '%'||lower(r.value)||'%' 
        or lower(coalesce(q.body_html,'')) like '%'||lower(r.value)||'%'
      )
  ) then
    spam_hit := true;
  end if;
  
  if spam_hit then 
    reasons := reasons || 'spam_phrase'; 
    score := score - 20; 
  end if;

  -- Body length + unsubscribe
  text_len := public.html_text_len(q.body_html);
  if text_len < 40 then 
    reasons := reasons || 'too_short'; 
    score := score - 15; 
  end if;
  
  if text_len > 5000 then 
    reasons := reasons || 'too_long'; 
    score := score - 10; 
  end if;
  
  if position('unsubscribe' in lower(coalesce(q.body_html,''))) = 0 then
    reasons := reasons || 'no_unsubscribe'; 
    score := score - 5;
  end if;

  -- Sender domain health (optional)
  if sender_domain is not null then
    select * into dh from public.domain_health where domain = sender_domain;
    if found and (
      dh.blocklisted 
      or dh.reputation='bad' 
      or not coalesce(dh.spf_ok,true) 
      or not coalesce(dh.dkim_ok,true)
      or not coalesce(dh.dmarc_ok,true)
    ) then
      reasons := reasons || 'domain_unhealthy'; 
      score := score - 25;
    end if;
  end if;

  -- Decision bands
  reasons := array_remove(reasons,'ok');
  if score >= 70 and not (blocked_domain or spam_hit) then
    return query select 'allow'::preflight_decision, score, coalesce(reasons,ARRAY['ok']), jsonb_build_object(
      'links', link_count, 'sent_today', sent_today, 'ramp_limit', ramp_limit
    );
  elsif score >= 40 then
    return query select 'hold'::preflight_decision, score, reasons, jsonb_build_object(
      'links', link_count, 'sent_today', sent_today, 'ramp_limit', ramp_limit
    );
  else
    return query select 'block'::preflight_decision, score, reasons, jsonb_build_object(
      'links', link_count, 'sent_today', sent_today, 'ramp_limit', ramp_limit
    );
  end if;
end;
$$;

-- Convenience wrapper: evaluate + persist + mark status
create or replace function public.preflight_apply(p_queue_id uuid)
returns preflight_decision
language plpgsql
security definer
as $$
declare
  d preflight_decision;
  s int;
  r text[];
  det jsonb;
  q record;
begin
  select * into q from public.send_queue where id = p_queue_id for update;
  
  if not found then
    return 'block'::preflight_decision;
  end if;
  
  select decision, score, reasons, details into d, s, r, det 
  from public.preflight_evaluate_row(p_queue_id);

  insert into public.preflight_results(queue_id, account_id, decision, score, reasons, details)
  values (p_queue_id, q.account_id, d, s, r, det);

  update public.send_queue
     set preflight_decision = d,
         preflight_score = s,
         preflight_reasons = r,
         held_at = case when d = 'hold' then now() else held_at end,
         status = case when d = 'block' then 'held_preflight'
                       when d = 'hold'  then 'held_preflight'
                       else status end
   where id = p_queue_id;

  return d;
end;
$$;

