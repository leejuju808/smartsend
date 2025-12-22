-- Campaign Rules Migration
-- Adds reply rules configuration to campaigns table

-- A) Add rules to campaigns
alter table public.campaigns
  add column if not exists stop_on_reply boolean default true,
  add column if not exists stop_on_unsubscribe boolean default true,
  add column if not exists stop_on_ooh boolean default true,      -- pause follow-ups on OOO
  add column if not exists stop_on_bounce boolean default true,
  add column if not exists custom_positive_keywords text[] default '{}',
  add column if not exists custom_negative_keywords text[] default '{}',
  add column if not exists autoresponder_keywords text[] default '{ "out of office","automatic reply","autoreply" }',
  add column if not exists updated_at timestamptz default now();

-- Helper view (optional) for quick fetch
create or replace view public.campaign_rules as
select 
  id as campaign_id,
  stop_on_reply, 
  stop_on_unsubscribe, 
  stop_on_ooh, 
  stop_on_bounce,
  custom_positive_keywords, 
  custom_negative_keywords, 
  autoresponder_keywords
from public.campaigns;

-- Grant select on view to authenticated users
grant select on public.campaign_rules to authenticated;

