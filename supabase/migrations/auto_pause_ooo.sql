create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- 1) Thread-level pause flags
alter table public.inbox_threads
  add column if not exists paused_until timestamptz,
  add column if not exists paused_reason text,
  add column if not exists paused_by_system boolean not null default false,
  add column if not exists ooo_return_at timestamptz,
  add column if not exists ooo_note text;

create index if not exists idx_threads_paused_until on public.inbox_threads(paused_until);

-- 2) Optional pause log
create table if not exists public.followup_pauses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  paused_until timestamptz,
  reason text not null,
  paused_by_system boolean not null default true,
  note text
);

create index if not exists idx_pauses_thread on public.followup_pauses(thread_id);

-- 3) Helpers: latest inbound body & return-date parser
create or replace function public.latest_inbound_text(p_thread uuid)
returns text
language sql
stable
as $$
  select im.text_body
  from public.inbox_messages im
  where im.thread_id = p_thread
    and im.direction = 'inbound'
    and coalesce(nullif(trim(im.text_body), ''), '') <> ''
  order by im.created_at desc
  limit 1
$$;

create or replace function public.guess_ooo_return_at(p_text text)
returns timestamptz
language plpgsql
as $$
declare
  y int := extract(year from now())::int;
  m text;
  mm int;
  dd int;
  iso text;
  dt timestamptz;
begin
  if p_text is null then
    return null;
  end if;

  -- ISO like 2025-11-12
  iso := substring(p_text from '((20|19)\d{2}-\d{1,2}-\d{1,2})');
  if iso is not null then
    begin
      dt := (iso || ' 09:00')::timestamptz;
      return dt;
    exception
      when others then
        null;
    end;
  end if;

  -- M/D or M-D (assume current year) e.g., 11/12 or 11-12
  m := substring(p_text from '(^|[^0-9])(\d{1,2})[/-](\d{1,2})([^0-9]|$)');
  if m is not null then
    mm := substring(m from '(\d{1,2})[/-]')::int;
    dd := substring(m from '[/-](\d{1,2})')::int;
    begin
      dt := to_timestamp(y || '-' || mm || '-' || dd || ' 09:00', 'YYYY-MM-DD HH24:MI')::timestamptz;
      return dt;
    exception
      when others then
        null;
    end;
  end if;

  -- "back on Nov 12" / "returning Monday, November 12"
  m := substring(p_text from '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})');
  if m is not null then
    begin
      dt := to_timestamp(y || ' ' || m || ' 09:00', 'YYYY Mon DD HH24:MI')::timestamptz;
      return dt;
    exception
      when others then
        begin
          dt := to_timestamp(y || ' ' || m || ' 09:00', 'YYYY Month DD HH24:MI')::timestamptz;
          return dt;
        exception
          when others then
            null;
        end;
    end;
  end if;

  return null;
end;
$$;


-- 4) Trigger: when a thread becomes OOO, pause + set resume
create or replace function public.pause_on_ooo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txt text;
  v_guess timestamptz;
  v_pause_until timestamptz;
begin
  if new.reply_type = 'ooo' and coalesce(old.reply_type, '') <> 'ooo' then
    v_txt := public.latest_inbound_text(new.id);
    v_guess := public.guess_ooo_return_at(v_txt);

    v_pause_until := coalesce(v_guess, now() + interval '14 days');

    update public.inbox_threads
    set paused_until     = v_pause_until,
        paused_reason    = 'ooo',
        paused_by_system = true,
        ooo_return_at    = v_guess,
        ooo_note         = left(coalesce(v_txt, ''), 300)
    where id = new.id;

    insert into public.followup_pauses (campaign_id, thread_id, paused_until, reason, paused_by_system, note)
    values (new.campaign_id, new.id, v_pause_until, 'ooo', true, 'auto from reply classifier');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pause_on_ooo on public.inbox_threads;
create trigger trg_pause_on_ooo
after update of reply_type on public.inbox_threads
for each row
execute function public.pause_on_ooo();

-- 5) Guard the send queue (never send while paused)
create or replace view public.v_send_queue_ready as
select q.*
from public.send_queue q
join public.inbox_threads t on t.id = q.thread_id
where q.status = 'pending'
  and (t.paused_until is null or t.paused_until <= now());

-- 6) Auto-resume job (pg_cron)
create or replace function public.resume_due_threads()
returns void
language plpgsql
as $$
begin
  update public.inbox_threads
  set paused_until    = null,
      paused_reason   = null,
      paused_by_system = false,
      ooo_note        = ooo_note,
      updated_at      = now()
  where paused_reason = 'ooo'
    and paused_until is not null
    and paused_until <= now();
end;
$$;

select cron.unschedule('auto-resume-ooo');
select cron.schedule(
  'auto-resume-ooo',
  '*/15 * * * *',
  $$select public.resume_due_threads();$$
);

-- 7) Manual resume RPC
create or replace function public.resume_thread(p_thread uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.inbox_threads
  set paused_until    = null,
      paused_reason   = null,
      paused_by_system = false
  where id = p_thread;
$$;
