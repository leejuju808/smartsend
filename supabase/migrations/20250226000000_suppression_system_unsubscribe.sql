-- A) Global suppression list (per owner/tenant)

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext,
  domain citext,
  source text check (source in ('link','admin','bounce','reply-unsubscribe','import')),
  note text
);

create index if not exists idx_suppressions_user_email on public.suppressions(user_id, email);
create index if not exists idx_suppressions_user_domain on public.suppressions(user_id, domain);

-- B) Ensure leads carry owner + email/domain (idempotent safety)

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists domain citext,
  add column if not exists email text;

create index if not exists idx_leads_user_email on public.leads(user_id, email);
create index if not exists idx_leads_user_domain on public.leads(user_id, domain);

-- C) Add fields to send_logs used by tracking/unsub

alter table public.send_logs
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists unsubscribe_token text;

create index if not exists idx_send_logs_thread on public.send_logs(thread_id);

-- D) Owner resolution for campaigns (used by suppression checks)
-- (Assumes campaigns has user_id)

create or replace view public.v_campaign_owner as
select c.id as campaign_id, c.user_id
from public.campaigns c;

-- E) Helper: is a recipient suppressed for this owner?

create or replace function public.is_suppressed(p_user uuid, p_email text, p_domain text)
returns boolean
language sql stable as $$
  select exists (
    select 1 from public.suppressions s
    where s.user_id = p_user
      and (
        (p_email is not null and s.email = p_email)
        or (p_domain is not null and s.domain = p_domain)
      )
  );
$$;

-- F) Helper: upsert suppression (email or domain)

create or replace function public.upsert_suppression(
  p_user uuid,
  p_email text,
  p_domain text,
  p_source text,
  p_note text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if p_email is null and p_domain is null then
    raise exception 'Provide email or domain';
  end if;

  -- email-specific
  if p_email is not null then
    -- Check if exists first
    select id into v_id
    from public.suppressions
    where user_id = p_user and email = p_email
    limit 1;
    
    if v_id is not null then
      -- Update existing
      update public.suppressions
      set source = p_source, note = p_note
      where id = v_id;
    else
      -- Insert new
      insert into public.suppressions(user_id, email, domain, source, note)
      values (p_user, p_email, null, p_source, p_note)
      returning id into v_id;
    end if;
    
    if v_id is not null then return v_id; end if;
  end if;

  -- domain-wide
  if p_domain is not null then
    -- Check if exists first
    select id into v_id
    from public.suppressions
    where user_id = p_user and domain = p_domain
    limit 1;
    
    if v_id is not null then
      -- Update existing
      update public.suppressions
      set source = p_source, note = p_note
      where id = v_id;
    else
      -- Insert new
      insert into public.suppressions(user_id, email, domain, source, note)
      values (p_user, null, p_domain, p_source, p_note)
      returning id into v_id;
    end if;
  end if;

  return v_id;
end $$;

-- G) Auto-suppress when AI labels an inbound as 'unsubscribe'

create or replace function public.tg_suppress_on_unsubscribe()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user uuid;
  v_email text;
  v_domain text;
begin
  -- Only when label flips to 'unsubscribe'
  if NEW.direction = 'inbound'
     and NEW.ai_label = 'unsubscribe'
     and (OLD.ai_label is distinct from NEW.ai_label)
  then
    -- resolve thread -> campaign -> owner, and lead email/domain
    select c.user_id into v_user
    from public.inbox_threads t
    join public.campaigns c on c.id = t.campaign_id
    where t.id = NEW.thread_id;

    select l.email, l.domain into v_email, v_domain
    from public.inbox_messages m
    join public.leads l on l.id = m.lead_id
    where m.id = NEW.id;

    -- fallback: if not on message row, try thread join
    if v_email is null then
      select l.email, l.domain into v_email, v_domain
      from public.inbox_threads t
      join public.leads l on l.id = t.lead_id
      where t.id = NEW.thread_id;
    end if;

    if v_user is not null then
      perform public.upsert_suppression(v_user, v_email, v_domain, 'reply-unsubscribe', 'AI label');
    end if;

    -- stop future sends (already wired) but ensure again
    perform public.mark_thread_replied(NEW.thread_id, NEW.created_at);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_suppress_on_unsubscribe on public.inbox_messages;
create trigger trg_suppress_on_unsubscribe
after update of ai_label on public.inbox_messages
for each row execute function public.tg_suppress_on_unsubscribe();

-- Grant execute permissions
grant execute on function public.is_suppressed(uuid, text, text) to authenticated, service_role;
grant execute on function public.upsert_suppression(uuid, text, text, text, text) to authenticated, service_role;

-- RLS for suppressions table
alter table public.suppressions enable row level security;

drop policy if exists "suppressions_select_own" on public.suppressions;
create policy "suppressions_select_own" on public.suppressions
  for select using (user_id = auth.uid());

drop policy if exists "suppressions_insert_own" on public.suppressions;
create policy "suppressions_insert_own" on public.suppressions
  for insert with check (user_id = auth.uid());

drop policy if exists "suppressions_service_role" on public.suppressions;
create policy "suppressions_service_role" on public.suppressions
  for all using (true) with check (true);

