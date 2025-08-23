-- Add trial usage counter columns to profiles table
alter table public.profiles
  add column if not exists trial_replies_sent int default 0,
  add column if not exists trial_contacts_imported int default 0,
  add column if not exists trial_extension_days int default 0;

-- Create RPC functions for incrementing trial counters
create or replace function increment_trial_replies(uid uuid)
returns void language sql as $$
  update public.profiles
    set trial_replies_sent = trial_replies_sent + 1
  where id = uid;
$$;

create or replace function increment_trial_contacts(uid uuid, n int)
returns void language sql as $$
  update public.profiles
    set trial_contacts_imported = trial_contacts_imported + n
  where id = uid;
$$;

create or replace function increment_trial_extension(uid uuid)
returns void language sql as $$
  update public.profiles
    set trial_extension_days = trial_extension_days + 1
  where id = uid;
$$; 