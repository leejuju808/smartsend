-- Signature parser support structures
-- 1) Store parsed signature facts (per message)
create table if not exists public.signature_facts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  full_name text,
  title text,
  company text,
  phones jsonb not null default '[]'::jsonb,      -- [{e164,raw,label}]
  emails jsonb not null default '[]'::jsonb,      -- [{email,label}]
  website text,
  timezone text,                                  -- IANA, e.g. "America/Chicago"
  addr_text text,                                 -- freeform address line(s)
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_signature_facts_msg on public.signature_facts(message_id);

-- 2) Lead enrichment history (audit)
create table if not exists public.lead_enrichment_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null,                            -- 'signature_parser'
  changed jsonb not null                           -- {"timezone":"America/Chicago","phone_added":"+12065551234", ...}
);

-- 3) Alt emails (leveraged by Block 79); ensure exists
create table if not exists public.lead_alt_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  email text not null,
  source text not null,                             -- 'signature','manual','enrichment'
  confidence numeric not null default 0.8,
  unique (lead_id, email)
);

-- 4) Simple phone normalizer (Postgres function)
create or replace function public.fn_norm_phone(p text)
returns text language plpgsql immutable as $$
declare
  digits text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if length(digits) = 10 then
    return '+1'||digits;           -- default to US/CA if you’re US-first; adjust as needed
  elsif length(digits) = 11 and substr(digits,1,1)='1' then
    return '+'||digits;
  elsif length(digits) >= 8 then
    return '+'||digits;            -- best-effort
  end if;
  return null;
end $$;

-- 5) Upsert helpers (used by function)
create or replace function public.fn_apply_signature_enrichment(
  p_account_id uuid,
  p_lead_id uuid,
  p_name text,
  p_title text,
  p_company text,
  p_tz text,
  p_emails jsonb,
  p_phones jsonb,
  p_website text
) returns void
language plpgsql
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_old record;
  v_email text;
  v_phone text;
begin
  select * into v_old from public.leads where id = p_lead_id for update;

  if p_name is not null and coalesce(v_old.full_name,'') = '' then
    update public.leads set full_name = p_name, updated_at = now() where id = p_lead_id;
    v_changes := v_changes || jsonb_build_object('full_name', p_name);
  end if;

  if p_company is not null and coalesce(v_old.company,'') = '' then
    update public.leads set company = p_company, updated_at = now() where id = p_lead_id;
    v_changes := v_changes || jsonb_build_object('company', p_company);
  end if;

  if p_title is not null and coalesce(v_old.title,'') = '' then
    update public.leads set title = p_title, updated_at = now() where id = p_lead_id;
    v_changes := v_changes || jsonb_build_object('title', p_title);
  end if;

  if p_tz is not null and (v_old.timezone is null or v_old.timezone = '') then
    update public.leads set timezone = p_tz, updated_at = now() where id = p_lead_id;
    v_changes := v_changes || jsonb_build_object('timezone', p_tz);
  end if;

  -- alt emails
  if p_emails is not null then
    for v_email in select value->>'email' from jsonb_array_elements(p_emails) as t(value)
    loop
      if v_email is not null and v_email <> v_old.email then
        insert into public.lead_alt_emails(account_id, lead_id, email, source, confidence)
        values (p_account_id, p_lead_id, lower(v_email), 'signature', 0.85)
        on conflict (lead_id, email) do nothing;
      end if;
    end loop;
  end if;

  -- primary phone (first normalized) if blank
  if p_phones is not null and (v_old.phone is null or v_old.phone='') then
    for v_phone in select public.fn_norm_phone(value->>'raw') from jsonb_array_elements(p_phones) as t(value)
    loop
      if v_phone is not null then
        update public.leads set phone = v_phone, updated_at = now() where id = p_lead_id;
        v_changes := v_changes || jsonb_build_object('phone', v_phone);
        exit;
      end if;
    end loop;
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.lead_enrichment_log(account_id, lead_id, source, changed)
    values (p_account_id, p_lead_id, 'signature_parser', v_changes);
  end if;
end $$;

-- 6) RLS (adapt tenant model)
alter table public.signature_facts enable row level security;
create policy signature_facts_iso on public.signature_facts using (account_id = auth.uid());

alter table public.lead_enrichment_log enable row level security;
create policy enrichment_log_iso on public.lead_enrichment_log using (account_id = auth.uid());

alter table public.lead_alt_emails enable row level security;
create policy alt_emails_iso on public.lead_alt_emails using (account_id = auth.uid());

