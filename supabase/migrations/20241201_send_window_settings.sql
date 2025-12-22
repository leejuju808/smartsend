-- per-org delivery policy
create table if not exists org_send_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  timezone text not null default 'America/Los_Angeles', -- IANA TZ
  window_start int not null default 9,   -- 0-23 local hour (inclusive)
  window_end   int not null default 17,  -- 0-23 local hour (exclusive)
  weekdays int[] not null default '{1,2,3,4,5}', -- 0=Sun..6=Sat
  updated_at timestamptz default now()
);

-- optional overrides per enrollment (nullable = use org defaults)
alter table sequence_enrollments
  add column if not exists send_tz text,
  add column if not exists send_window_start int,
  add column if not exists send_window_end int,
  add column if not exists send_weekdays int[];

-- seed defaults for existing orgs
insert into org_send_settings (org_id)
select id from orgs o
where not exists (select 1 from org_send_settings s where s.org_id = o.id);