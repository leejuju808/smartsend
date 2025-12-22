-- Add templating fields to leads table
alter table leads add column if not exists first_name text;
alter table leads add column if not exists last_name text;
alter table leads add column if not exists company text;
alter table leads add column if not exists title text;
alter table leads add column if not exists custom jsonb;

-- Optional: quick JSON indexing for custom fields
create index if not exists leads_custom_gin on leads using gin (custom);