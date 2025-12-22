-- Block 177: Trigger for new lead same company intent signal
-- Generates intent signal when a new lead from the same company is added

create or replace function public.handle_new_lead_intent_signal()
returns trigger
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_org_id uuid;
  v_existing_count int;
  v_domain text;
begin
  -- Extract domain from email
  v_domain := lower(split_part(new.email, '@', 2));
  
  if v_domain is null or v_domain = '' then
    return new;
  end if;

  -- Get org_id from lead (try org_id column first, fallback to other methods)
  v_org_id := coalesce(
    new.org_id,
    (select org_id from public.campaigns where id = new.campaign_id limit 1),
    (select org_id from public.organizations limit 1) -- fallback, adjust as needed
  );

  if v_org_id is null then
    return new;
  end if;

  -- Find or create company by domain
  select id into v_company_id
  from public.companies
  where domain = v_domain
    and org_id = v_org_id
  limit 1;

  -- If company doesn't exist, try to create it (optional - you may want to handle this differently)
  if v_company_id is null then
    insert into public.companies (org_id, domain, name)
    values (v_org_id, v_domain, coalesce(new.company, v_domain))
    on conflict (org_id, domain) do nothing
    returning id into v_company_id;
    
    -- If still null, get it from the conflict resolution
    if v_company_id is null then
      select id into v_company_id
      from public.companies
      where domain = v_domain and org_id = v_org_id
      limit 1;
    end if;
  end if;

  if v_company_id is null then
    return new;
  end if;

  -- Update lead's company_id
  update public.leads
  set company_id = v_company_id
  where id = new.id;

  -- Count existing leads from this company
  select count(*) into v_existing_count
  from public.leads
  where company_id = v_company_id
    and id != new.id;

  -- If there are existing leads, generate intent signal
  if v_existing_count > 0 then
    insert into public.intent_signals (
      account_id,
      company_id,
      lead_id,
      signal_type,
      weight
    ) values (
      v_org_id,
      v_company_id,
      new.id,
      'new_lead_same_company',
      2
    );
  end if;

  return new;
end;
$$;

-- Create trigger
drop trigger if exists trg_new_lead_intent_signal on public.leads;
create trigger trg_new_lead_intent_signal
after insert on public.leads
for each row
execute function public.handle_new_lead_intent_signal();

-- Comment
comment on function public.handle_new_lead_intent_signal() is 'Generates intent signal when a new lead from an existing company is added';












