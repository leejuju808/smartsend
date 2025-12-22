-- Threads automatic resume support
alter table if exists public.threads
  add column if not exists resume_at timestamptz;

create index if not exists idx_threads_resume_due
  on public.threads(resume_at)
  where auto_paused = true;

-- Leads mute flag
alter table if exists public.leads
  add column if not exists is_muted boolean not null default false;

create index if not exists idx_leads_is_muted
  on public.leads(is_muted);

-- RPC: pause lead automation with optional resume time
create or replace function public.pause_lead_automation(
  p_thread_id uuid,
  p_resume_at timestamptz default null
)
returns void
language sql
security definer
as $$
  update public.threads
     set auto_paused = true,
         resume_at = p_resume_at,
         updated_at = now()
   where id = p_thread_id;
$$;

comment on function public.pause_lead_automation(uuid, timestamptz)
  is 'Marks a thread as auto_paused and optionally schedules a resume timestamp.';

-- RPC: unpause resume-due threads
create or replace function public.unpause_due_threads()
returns setof uuid
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id
      from public.threads
     where auto_paused = true
       and resume_at is not null
       and resume_at <= now()
  loop
    update public.threads
       set auto_paused = false,
           resume_at = null,
           updated_at = now()
     where id = r.id;

    return next r.id;
  end loop;

  return;
end;
$$;

comment on function public.unpause_due_threads()
  is 'Clears auto_paused flag for threads whose resume_at is due, returning resumed IDs.';

-- RPC: mute a lead from automation
create or replace function public.mute_lead(p_lead_id uuid)
returns void
language sql
security definer
as $$
  update public.leads
     set is_muted = true,
         updated_at = now()
   where id = p_lead_id;
$$;

comment on function public.mute_lead(uuid)
  is 'Sets the lead mute flag, preventing future automation sends.';




