-- =============================================================
-- 1) Tenant-scoped DNC registry + helpers (idempotent)
--    Run in Supabase SQL editor
-- =============================================================

-- A) Tenant-scoped do-not-contact registry
create table if not exists public.do_not_contact (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext,
  domain citext,
  source text,
  reason text,
  unique (user_id, email),
  unique (user_id, domain)
);

create index if not exists idx_dnc_user_email on public.do_not_contact(user_id, email);
create index if not exists idx_dnc_user_domain on public.do_not_contact(user_id, domain);


-- B) Lead-level convenience flags
alter table public.leads
  add column if not exists unsubscribed boolean not null default false,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribed_reason text;

create index if not exists idx_leads_unsub on public.leads(unsubscribed);


-- C) Helper: resolve if a (user, lead/email) is blocked
create or replace function public.is_dnc(p_user uuid, p_email text)
returns boolean
language sql
stable
set search_path = public
as $$
  with norm as (
    select lower(trim(p_email)) as e,
           split_part(lower(trim(p_email)),'@',2) as d
  )
  select exists (
    select 1 from norm n
    where exists (
      select 1
      from public.do_not_contact dnc
      where dnc.user_id = p_user
        and dnc.email = n.e
    )
       or exists (
      select 1
      from public.do_not_contact dnc
      where dnc.user_id = p_user
        and dnc.domain = n.d
    )
  );
$$;

grant execute on function public.is_dnc(uuid, text) to service_role;


-- D) RPC: upsert unsubscribe for a lead (service-role)
create or replace function public.unsubscribe_lead(
  p_user uuid,
  p_lead uuid,
  p_reason text default 'unsubscribe'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext;
begin
  select email into v_email from public.leads where id = p_lead;

  if v_email is null then
    raise exception 'Lead email not found';
  end if;

  -- insert DNC by email (exact)
  insert into public.do_not_contact (user_id, email, source, reason)
  values (p_user, v_email, 'unsubscribe', p_reason)
  on conflict (user_id, email) do update set reason = excluded.reason;

  -- mark lead
  update public.leads
     set unsubscribed = true,
         unsubscribed_at = now(),
         unsubscribed_reason = p_reason
   where id = p_lead;

  -- cancel remaining sends for this lead across all campaigns owned by user
  update public.send_queue q
     set status = 'canceled',
         canceled_reason = coalesce(canceled_reason, 'autopause:unsubscribe'),
         updated_at = now()
   from public.campaigns c
   where q.campaign_id = c.id
     and c.user_id = p_user
     and q.lead_id = p_lead
     and q.status in ('pending','retrying');
end;
$$;

revoke all on function public.unsubscribe_lead(uuid, uuid, text) from anon, authenticated;
grant execute on function public.unsubscribe_lead(uuid, uuid, text) to service_role;


-- E) Helper: can enqueue to lead guard
create or replace function public.can_enqueue_to_lead(p_user uuid, p_lead uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_email text;
  v_block boolean;
begin
  select email into v_email from public.leads where id = p_lead;

  if v_email is null then
    return false;
  end if;

  select public.is_dnc(p_user, v_email) into v_block;

  if v_block then
    return false;
  end if;

  if (select unsubscribed from public.leads where id = p_lead) then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.can_enqueue_to_lead(uuid, uuid) to service_role;


-- F) Trigger: prevent enqueueing suppressed leads
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_send_queue_dnc_block') then
    create function public._trg_send_queue_dnc_block()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    declare
      v_user uuid;
      v_ok boolean;
    begin
      select user_id into v_user from public.campaigns where id = new.campaign_id;
      select public.can_enqueue_to_lead(v_user, new.lead_id) into v_ok;

      if not v_ok then
        raise exception 'DNC/Unsubscribed: cannot enqueue to this lead';
      end if;

      return new;
    end;
    $fn$;

    create trigger trg_send_queue_dnc_block
      before insert on public.send_queue
      for each row
      execute function public._trg_send_queue_dnc_block();
  end if;
end $$;


-- G) RPC: resubscribe lead (optional helper)
create or replace function public.resubscribe_lead(p_user uuid, p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext;
begin
  select email into v_email from public.leads where id = p_lead;

  if v_email is null then
    raise exception 'Lead email not found';
  end if;

  delete from public.do_not_contact where user_id = p_user and email = v_email;

  update public.leads
     set unsubscribed = false,
         unsubscribed_at = null,
         unsubscribed_reason = null
   where id = p_lead;
end;
$$;

revoke all on function public.resubscribe_lead(uuid, uuid) from anon, authenticated;
grant execute on function public.resubscribe_lead(uuid, uuid) to service_role;


