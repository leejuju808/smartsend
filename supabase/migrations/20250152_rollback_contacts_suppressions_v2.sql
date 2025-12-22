-- Rollback migration for contacts_suppressions_v2
-- Use this if you need to revert the changes

-- 1) Drop triggers first
drop trigger if exists trg_contacts_v2_normalize on public.contacts_v2;
drop trigger if exists trg_suppressions_v2_normalize on public.suppressions_v2;

-- 2) Drop tables (this will cascade to indexes and policies)
drop table if exists public.contacts_v2 cascade;
drop table if exists public.suppressions_v2 cascade;

-- 3) Drop functions
drop function if exists public.bulk_insert_contacts_v2(uuid, text[], text[], text[], text[]);
drop function if exists public.tg_normalize_email();
drop function if exists public.normalize_email(text);

-- 4) Drop extensions (only if not used elsewhere)
-- Uncomment these if you're sure no other tables use them:
-- drop extension if exists "uuid-ossp";
-- drop extension if exists pgcrypto;

-- Note: This rollback will permanently delete all data in contacts_v2 and suppressions_v2
-- Make sure you have backups if you need to preserve the data 