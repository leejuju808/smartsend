-- Block 275000 — SmartSend Authority Loop v1
-- “Make Roofers Look Bigger Than They Are”
--
-- Objective: store minimal company profile fields once and reuse across estimates + outbound email.

BEGIN;

-- 1) public.companies (global) — add missing fields (logo_url already exists in newer schema)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS years_in_business text,
  ADD COLUMN IF NOT EXISTS service_area text;

-- 2) public.contractor_profile (roofing) — add missing fields used by Settings + messaging
ALTER TABLE public.contractor_profile
  ADD COLUMN IF NOT EXISTS years_in_business text,
  ADD COLUMN IF NOT EXISTS service_area text;

COMMIT;









