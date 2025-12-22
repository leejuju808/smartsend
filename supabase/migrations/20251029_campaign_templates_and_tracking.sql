-- Campaign has a template + schedule window

alter table public.campaigns

  add column if not exists subject_template text,

  add column if not exists body_template text,        -- HTML supported

  add column if not exists daily_send_limit int not null default 300,

  add column if not exists send_window_start time with time zone default '08:00:00-07',

  add column if not exists send_window_end   time with time zone default '18:00:00-07';



-- Track events on queue rows

alter table public.send_queue

  add column if not exists open_count int not null default 0,

  add column if not exists click_count int not null default 0,

  add column if not exists tracking_token uuid default gen_random_uuid();



create index if not exists send_queue_tracking_idx on public.send_queue (tracking_token);



-- Optional detailed event tables (nice for analytics)

create table if not exists public.email_open_events (

  id uuid primary key default gen_random_uuid(),

  queue_id uuid not null references public.send_queue(id) on delete cascade,

  occurred_at timestamptz not null default now(),

  ip text, ua text

);

create index if not exists email_open_events_queue_idx on public.email_open_events(queue_id);



create table if not exists public.email_click_events (

  id uuid primary key default gen_random_uuid(),

  queue_id uuid not null references public.send_queue(id) on delete cascade,

  occurred_at timestamptz not null default now(),

  url text not null,

  ip text, ua text

);

create index if not exists email_click_events_queue_idx on public.email_click_events(queue_id);















