do $$
begin
  alter table public.meeting_prefs
    add constraint meeting_prefs_hours
    check (start_hour >= 0 and end_hour <= 23 and start_hour < end_hour);
exception
  when duplicate_object then null;
end;
$$;

create or replace function public._seed_meeting_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meeting_prefs (
    campaign_id,
    duration_min,
    tz,
    workdays,
    start_hour,
    end_hour,
    buffer_min,
    location,
    booking_link
  )
  values (
    new.id,
    30,
    'America/Los_Angeles',
    '{1,2,3,4,5}',
    9,
    17,
    15,
    'Google Meet',
    null
  )
  on conflict (campaign_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_meeting_prefs on public.campaigns;

create trigger trg_seed_meeting_prefs
after insert on public.campaigns
for each row execute function public._seed_meeting_prefs();


