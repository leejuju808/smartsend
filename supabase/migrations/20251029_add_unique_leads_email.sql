-- Normalize email uniqueness per campaign, case-insensitive

create extension if not exists citext;



alter table public.leads
  alter column email type citext using email::citext;



-- unique per campaign, ignoring NULL emails
create unique index if not exists leads_campaign_email_uniq
  on public.leads (campaign_id, email)
  where email is not null;














