-- 1) Store structured OOO parses
create table if not exists public.ooo_extracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  source text not null default 'llm',
  return_at timestamptz,
  person text,
  confidence real,
  raw jsonb
);

create index if not exists idx_ooo_extracts_thread on public.ooo_extracts(thread_id);

-- 2) Thread-facing helper view
create or replace view public.v_threads_resume as
with resume_options as (
  select
    t.id as thread_id,
    t.campaign_id,
    t.paused_reason,
    t.paused_until,
    t.ooo_return_at,
    (
      select min(val)
      from (values (t.paused_until), (t.ooo_return_at)) as vals(val)
      where val is not null
    ) as resume_at
  from public.inbox_threads t
)
select
  r.thread_id,
  r.campaign_id,
  r.paused_reason,
  r.paused_until,
  r.ooo_return_at,
  r.resume_at,
  (
    case
      when r.resume_at is not null
        and r.resume_at <= now() + interval '24 hours'
        and r.resume_at > now()
      then true
      else false
    end
  ) as resumes_within_24h
from resume_options r;

-- 3) Auto-run extractor trigger
create or replace function public.call_extract_ooo()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url text := public.edge_base_url() || '/extract-ooo-details';
  v_auth text := 'Bearer ' || current_setting('app.settings.service_role_key', true);
begin
  if (new.reply_type = 'ooo' and coalesce(old.reply_type, '') <> 'ooo')
     or (new.paused_reason = 'ooo' and coalesce(old.paused_reason, '') <> 'ooo') then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth),
      body := jsonb_build_object('thread_id', new.id)::text,
      timeout_milliseconds := 8000
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_call_extract_ooo on public.inbox_threads;
create trigger trg_call_extract_ooo
after update of reply_type, paused_reason on public.inbox_threads
for each row
execute function public.call_extract_ooo();

-- 4) Resume soon notifier artefacts
create table if not exists public.thread_banners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  kind text not null,
  message text not null,
  seen_by uuid references auth.users(id) on delete set null
);

create or replace function public.enqueue_resume_soon_banners()
returns void
language plpgsql
as $$
begin
  insert into public.thread_banners (thread_id, kind, message)
  select v.thread_id, 'resume_soon', 'This thread will auto-resume within 24 hours.'
  from public.v_threads_resume v
  left join public.thread_banners b
    on b.thread_id = v.thread_id
   and b.kind = 'resume_soon'
  where v.resumes_within_24h = true
    and b.id is null;
end;
$$;

select cron.unschedule('resume-soon-banners');
select cron.schedule(
  'resume-soon-banners',
  '0 * * * *',
  $$select public.enqueue_resume_soon_banners();$$
);

-- 5) Optional delay helper
create or replace function public.delay_thread_resume(p_thread uuid, p_days int default 7)
returns void
language sql
security definer
as $$
  update public.inbox_threads
  set paused_until = greatest(coalesce(paused_until, now()), now()) + (p_days || ' days')::interval,
      paused_reason = coalesce(paused_reason, 'ooo'),
      paused_by_system = true
  where id = p_thread;
$$;







