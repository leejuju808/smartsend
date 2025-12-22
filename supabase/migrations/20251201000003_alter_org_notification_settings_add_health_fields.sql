-- =========================================================
-- Block 21389 — SmartSend Roofing Health Settings Panel
-- Add health threshold fields to organization_notification_settings
-- =========================================================

alter table public.organization_notification_settings
  add column if not exists hot_threshold integer not null default 75,
  add column if not exists warm_threshold integer not null default 40,
  add column if not exists include_weekly_csv boolean not null default false;

comment on column public.organization_notification_settings.hot_threshold is 'Health score threshold for HOT jobs (default: 75). Scores >= this value are considered HOT.';
comment on column public.organization_notification_settings.warm_threshold is 'Health score threshold for WARM jobs (default: 40). Scores >= this value and < hot_threshold are considered WARM.';
comment on column public.organization_notification_settings.include_weekly_csv is 'Whether to attach a CSV of HOT jobs to the weekly email summary';

-- Add INSERT policy to allow upsert operations
create policy "org members can insert their notification settings"
on public.organization_notification_settings
for insert
with check ( public.is_org_member(org_id) );

