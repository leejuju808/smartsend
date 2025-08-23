-- Create RPC function to merge onboarding step flags into JSON field
create or replace function public.merge_onboarding_step(uid uuid, k text)
returns jsonb as $$
declare
  current jsonb;
begin
  select onboarding into current from public.profiles where id = uid;
  if current is null then
    current := '{}'::jsonb;
  end if;

  update public.profiles
    set onboarding = current || jsonb_build_object(k, true)
  where id = uid
  returning onboarding into current;

  return current;
end;
$$ language plpgsql security definer; 