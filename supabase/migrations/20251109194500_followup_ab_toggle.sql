alter table public.followup_rules
  add column if not exists ab_enabled boolean not null default false;

drop policy if exists sel_followup_rules on public.followup_rules;
create policy sel_followup_rules on public.followup_rules
  for select using ( public.is_campaign_viewer(campaign_id) );

drop policy if exists upd_followup_rules on public.followup_rules;
create policy upd_followup_rules on public.followup_rules
  for update using ( public.is_campaign_editor(campaign_id) )
  with check ( public.is_campaign_editor(campaign_id) );

