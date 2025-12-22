-- Block 411 — Global Search v1: Full-Text Search Indexes
-- Creates GIN indexes for fast full-text search on leads, campaigns, and sender_identities

-- 0.1 Leads Search Index
create index if not exists idx_leads_search
on leads using gin (
  to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,''))
);

-- 0.2 Campaign Search Index
create index if not exists idx_campaigns_search
on campaigns using gin (
  to_tsvector('simple', coalesce(name,''))
);

-- 0.3 Domain Search Index (sender_identities)
-- Check if sender_identities table exists and has the expected columns
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'sender_identities'
  ) then
    -- Check for email_address column (some migrations use this)
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'sender_identities' 
      and column_name = 'email_address'
    ) then
      create index if not exists idx_sender_identities_search
      on sender_identities using gin (
        to_tsvector('simple', coalesce(email_address,'') || ' ' || coalesce(domain,''))
      );
    -- Check for email_from column (other migrations use this)
    elsif exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'sender_identities' 
      and column_name = 'email_from'
    ) then
      create index if not exists idx_sender_identities_search
      on sender_identities using gin (
        to_tsvector('simple', coalesce(email_from,'') || ' ' || coalesce(domain,''))
      );
    -- Check for from_email column (other migrations use this)
    elsif exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'sender_identities' 
      and column_name = 'from_email'
    ) then
      create index if not exists idx_sender_identities_search
      on sender_identities using gin (
        to_tsvector('simple', coalesce(from_email,'') || ' ' || coalesce(domain,''))
      );
    end if;
  end if;
end $$;

-- 0.4 Email Events Search Index (for subject search)
-- Check if email_events table exists and has subject column
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'email_events'
  ) then
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'subject'
    ) then
      create index if not exists idx_email_events_search
      on email_events using gin (
        to_tsvector('simple', coalesce(subject,''))
      );
    end if;
  end if;
end $$;



