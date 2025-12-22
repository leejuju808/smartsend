create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'open',  -- open | done
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks enable row level security;

create policy "members read tasks" on public.tasks
  for select using (is_member(project_id));
create policy "members insert tasks" on public.tasks
  for insert with check (is_member(project_id));
create policy "members update tasks" on public.tasks
  for update using (is_member(project_id));

-- Auto-create a task when certain triage labels appear
create or replace function public.auto_task_from_triage()
returns trigger language plpgsql as $$
begin
  -- Only create if triage changed to one of the trigger values
  if (old.triage is distinct from new.triage) and new.triage in ('interested','meeting_request','pricing') then
    insert into public.tasks (project_id, thread_id, title, due_at)
    values (new.project_id, new.id,
      case new.triage
        when 'interested' then 'Follow up with interested lead'
        when 'meeting_request' then 'Confirm meeting time'
        when 'pricing' then 'Send pricing details'
      end,
      now() + interval '1 day');
  end if;
  return new;
end $$;

drop trigger if exists trg_threads_auto_task on public.threads;
create trigger trg_threads_auto_task
after update of triage on public.threads
for each row execute function public.auto_task_from_triage();

