-- Activity log

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid references auth.users(id),              -- null for system
  action text not null check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire'
  )),
  target_email text,                                    -- for invites or when logging share by email
  target_user_id uuid references auth.users(id),        -- when available
  meta jsonb not null default '{}',                     -- {role:"editor"->"viewer", reason:"self-remove"}
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_campaign on public.audit_logs(campaign_id, created_at desc);

alter table public.audit_logs enable row level security;

-- RLS: anyone who can view campaign can read its logs
drop policy if exists "audit_viewers_can_read" on public.audit_logs;
create policy "audit_viewers_can_read"
on public.audit_logs
for select
using (public.can_view_campaign(campaign_id));

-- Only system-owned functions insert logs
drop policy if exists "audit_no_direct_insert" on public.audit_logs;
create policy "audit_no_direct_insert"
on public.audit_logs
for insert
to authenticated
with check (false);

-- Helper: safe current user id
create or replace function public.current_uid()
returns uuid language sql stable security definer
as $$ select auth.uid() $$;

-- TRIG: Log share add/update/delete
create or replace function public.tg_log_share()
returns trigger
language plpgsql security definer
as $$
declare
  v_action text;
  v_meta jsonb := '{}'::jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'share.add';
    v_meta := jsonb_build_object('role', NEW.role);
    insert into public.audit_logs (campaign_id, actor_id, action, target_user_id, meta)
    values (NEW.campaign_id, public.current_uid(), v_action, NEW.user_id, v_meta);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    v_action := 'share.update';
    v_meta := jsonb_build_object('role_from', OLD.role, 'role_to', NEW.role);
    insert into public.audit_logs (campaign_id, actor_id, action, target_user_id, meta)
    values (NEW.campaign_id, public.current_uid(), v_action, NEW.user_id, v_meta);
    return NEW;
  elsif TG_OP = 'DELETE' then
    v_action := 'share.remove';
    v_meta := jsonb_build_object('role', OLD.role);
    insert into public.audit_logs (campaign_id, actor_id, action, target_user_id, meta)
    values (OLD.campaign_id, public.current_uid(), v_action, OLD.user_id, v_meta);
    return OLD;
  end if;
  return null;
end
$$;

drop trigger if exists tr_log_share on public.campaign_shares;
create trigger tr_log_share
after insert or update or delete on public.campaign_shares
for each row execute function public.tg_log_share();

-- TRIG: Log invite create/accept
create or replace function public.tg_log_invite()
returns trigger
language plpgsql security definer
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_logs (campaign_id, actor_id, action, target_email, meta)
    values (NEW.campaign_id, public.current_uid(), 'invite.create', NEW.email,
            jsonb_build_object('role', NEW.role, 'expires_at', NEW.expires_at));
    return NEW;
  elsif TG_OP = 'UPDATE' and NEW.accepted_at is not null and OLD.accepted_at is null then
    insert into public.audit_logs (campaign_id, actor_id, action, target_email, meta)
    values (NEW.campaign_id, public.current_uid(), 'invite.accept', NEW.email,
            jsonb_build_object('role', NEW.role));
    return NEW;
  end if;
  return NEW;
end
$$;

drop trigger if exists tr_log_invite on public.pending_invites;
create trigger tr_log_invite
after insert or update on public.pending_invites
for each row execute function public.tg_log_invite();

