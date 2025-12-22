-- Campaign webhook storage, policies, and helpers

set check_function_bodies = off;

create table if not exists public.campaign_webhooks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  url text not null,
  secret text,
  enabled boolean not null default true,
  event_types public.campaign_event_type[] not null default '{invite_created,invite_canceled,invite_accepted,member_role_changed,member_removed}'
);

create index if not exists idx_cwebhooks_campaign on public.campaign_webhooks(campaign_id);


alter table public.campaign_webhooks enable row level security;


drop policy if exists "cw_read" on public.campaign_webhooks;
create policy "cw_read" on public.campaign_webhooks
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));


drop policy if exists "cw_write" on public.campaign_webhooks;
create policy "cw_write" on public.campaign_webhooks
  for insert to authenticated
  with check (public.is_campaign_owner(campaign_id) or public.is_campaign_editor(campaign_id));


drop policy if exists "cw_update" on public.campaign_webhooks;
create policy "cw_update" on public.campaign_webhooks
  for update to authenticated
  using (public.is_campaign_owner(campaign_id) or public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_owner(campaign_id) or public.is_campaign_editor(campaign_id));


drop policy if exists "cw_delete" on public.campaign_webhooks;
create policy "cw_delete" on public.campaign_webhooks
  for delete to authenticated
  using (public.is_campaign_owner(campaign_id) or public.is_campaign_editor(campaign_id));


create or replace function public.get_event_webhooks(p_campaign uuid, p_type public.campaign_event_type)
returns table(id uuid, url text, secret text)
language sql stable
as $$
  select id, url, secret
  from public.campaign_webhooks
  where campaign_id = p_campaign
    and enabled
    and (p_type = any(event_types));
$$;





