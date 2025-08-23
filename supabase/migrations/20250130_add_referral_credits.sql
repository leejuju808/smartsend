-- Add referral_credits column to profiles for tracking referral bonuses
alter table public.profiles
  add column if not exists referral_credits int default 0;

-- Create function to increment referral credits
create or replace function increment_referral_credits(referrer uuid)
returns void language plpgsql as $$
begin
  update public.profiles
    set referral_credits = referral_credits + 100
  where id = referrer;
end;
$$;

-- Create index on referral_credits for efficient queries
create index if not exists idx_profiles_referral_credits on public.profiles(referral_credits); 