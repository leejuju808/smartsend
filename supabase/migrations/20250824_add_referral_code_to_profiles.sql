-- Add referral_code to profiles for invite links
alter table if exists public.profiles
  add column if not exists referral_code text;

-- Ensure unique constraint for referral codes
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_referral_code_key'
  ) then
    alter table public.profiles
      add constraint profiles_referral_code_key unique (referral_code);
  end if;
end $$;

