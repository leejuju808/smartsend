-- Account-level settings for duplicate auto-merge and RLS on merge rules

create table if not exists public.account_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  auto_merge_dupes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger if not exists trg_account_settings_updated_at
before update on public.account_settings
for each row
execute function public.set_updated_at();

insert into public.account_settings(account_id)
select id from public.accounts
on conflict do nothing;

alter table public.account_settings enable row level security;

drop policy if exists account_settings_select on public.account_settings;
create policy account_settings_select on public.account_settings
for select using (
  public.is_account_member(auth.uid(), account_id)
);

drop policy if exists account_settings_insert on public.account_settings;
create policy account_settings_insert on public.account_settings
for insert with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = account_settings.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

drop policy if exists account_settings_update on public.account_settings;
create policy account_settings_update on public.account_settings
for update using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = account_settings.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
) with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = account_settings.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

drop policy if exists account_settings_delete on public.account_settings;
create policy account_settings_delete on public.account_settings
for delete using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = account_settings.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

grant select, insert, update on public.account_settings to authenticated;

alter table public.merge_rules enable row level security;

drop policy if exists merge_rules_select on public.merge_rules;
create policy merge_rules_select on public.merge_rules
for select using (
  public.is_account_member(auth.uid(), account_id)
);

drop policy if exists merge_rules_insert on public.merge_rules;
create policy merge_rules_insert on public.merge_rules
for insert with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = public.merge_rules.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

drop policy if exists merge_rules_update on public.merge_rules;
create policy merge_rules_update on public.merge_rules
for update using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = public.merge_rules.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
) with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = public.merge_rules.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

drop policy if exists merge_rules_delete on public.merge_rules;
create policy merge_rules_delete on public.merge_rules
for delete using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = public.merge_rules.account_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

grant select, insert, update on public.merge_rules to authenticated;

create or replace function public.run_dupe_maintenance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
begin
  for v_account in
    select a.id as account_id, coalesce(s.auto_merge_dupes, false) as auto_merge
    from public.accounts a
    left join public.account_settings s on s.account_id = a.id
  loop
    begin
      perform public.set_account(v_account.account_id);
      perform public.refresh_lead_dupe_candidates();
      if v_account.auto_merge then
        perform public.auto_merge_dupes();
      end if;
    exception when others then
      null;
    end;
  end loop;

  perform set_config('app.account_id', '', true);
end;
$$;

grant execute on function public.run_dupe_maintenance() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lead-dupe-nightly') then
    perform cron.unschedule('lead-dupe-nightly');
  end if;
  perform cron.schedule('lead-dupe-nightly', '15 3 * * *', $$select public.run_dupe_maintenance();$$);
exception
  when undefined_table or insufficient_privilege or invalid_schema_name then
    null;
end $$;
