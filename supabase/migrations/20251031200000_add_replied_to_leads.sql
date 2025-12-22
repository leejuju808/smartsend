-- Add replied boolean column to leads table
alter table leads add column if not exists replied boolean default false;

