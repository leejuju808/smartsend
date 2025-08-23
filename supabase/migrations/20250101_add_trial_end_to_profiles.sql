-- Add trial_end column to profiles table
alter table public.profiles add column if not exists trial_end timestamptz; 