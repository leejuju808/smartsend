-- =========================================================
-- Block 8770 — Booking CTA Footer + Sender Identity
-- =========================================================
-- Adds company name, booking URL, phone, and email signature
-- to profiles table for roofing companies to add CTAs to every email

-- Add contact & booking columns to profiles table
alter table public.profiles
  add column if not exists company_name text,
  add column if not exists default_city text,
  add column if not exists booking_url text,
  add column if not exists phone text,
  add column if not exists email_signature text;

-- Add helpful comment
comment on column public.profiles.company_name is 'Company name displayed in email footer (e.g. "Summit Roofing Co.")';
comment on column public.profiles.default_city is 'Default city/area used in email templates (e.g. "Boise, ID")';
comment on column public.profiles.booking_url is 'Booking link (Calendly, website booking form, or contact page)';
comment on column public.profiles.phone is 'Main estimate phone number displayed in email footer';
comment on column public.profiles.email_signature is 'Optional signature line (e.g. "Licensed & insured. Local since 2008.")';

























































