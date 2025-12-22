-- Email tracking migration
-- Add tracking fields to campaign_logs
alter table campaign_logs
  add column if not exists tracking_token text unique,
  add column if not exists opens_count int default 0,
  add column if not exists clicks_count int default 0,
  add column if not exists last_opened_at timestamptz,
  add column if not exists last_clicked_at timestamptz;

-- Each unique URL inside an email gets a link row
create table if not exists message_links (
  id uuid primary key default uuid_generate_v4(),
  tracking_token text not null,         -- FK to campaign_logs.tracking_token (deferred; created pre-send)
  link_token text unique not null,      -- short id for redirect route
  original_url text not null,
  clicks int default 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_message_links_tracking on message_links(tracking_token);

-- Raw event stream (good for analytics)
create table if not exists email_events (
  id uuid primary key default uuid_generate_v4(),
  tracking_token text not null,
  event_type text check (event_type in ('open','click')) not null,
  link_token text,                      -- nullable for opens
  user_agent text,
  ip text,
  created_at timestamptz default now()
);
create index if not exists idx_email_events_tracking on email_events(tracking_token);

-- Optional helpers to bump counts atomically
create or replace function bump_open(_tok text, _ua text, _ip text)
returns void language plpgsql as $$
begin
  insert into email_events(tracking_token, event_type, user_agent, ip) values (_tok, 'open', _ua, _ip);
  update campaign_logs
     set opens_count = coalesce(opens_count,0) + 1,
         last_opened_at = now()
   where tracking_token = _tok;
end; $$;

create or replace function bump_click(_tok text, _ltok text, _ua text, _ip text)
returns void language plpgsql as $$
begin
  insert into email_events(tracking_token, event_type, link_token, user_agent, ip)
  values (_tok, 'click', _ltok, _ua, _ip);
  update message_links
     set clicks = clicks + 1,
         first_clicked_at = coalesce(first_clicked_at, now()),
         last_clicked_at = now()
   where link_token = _ltok;
  update campaign_logs
     set clicks_count = coalesce(clicks_count,0) + 1,
         last_clicked_at = now()
   where tracking_token = _tok;
end; $$;
