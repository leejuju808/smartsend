alter table public.projects enable row level security;

alter table public.project_members enable row level security;

alter table public.leads enable row level security;

alter table public.threads enable row level security;

alter table public.emails enable row level security;

alter table public.email_outbox enable row level security;



-- Helpers

create or replace function public.is_member(p_project uuid)

returns boolean language sql stable as $$

  select exists (

    select 1 from public.project_members

    where project_id = p_project and user_id = auth.uid()

  );

$$;



-- Policies

create policy "members read project"

on public.projects for select using (is_member(id));



create policy "members read/write membership"

on public.project_members

for select using (user_id = auth.uid() or is_member(project_id))

;



-- Leads

create policy "members read leads"

on public.leads for select using (is_member(project_id));

create policy "members insert leads"

on public.leads for insert with check (is_member(project_id));

create policy "members update leads"

on public.leads for update using (is_member(project_id));



-- Threads

create policy "members read threads"

on public.threads for select using (is_member(project_id));

create policy "members insert threads"

on public.threads for insert with check (is_member(project_id));

create policy "members update threads"

on public.threads for update using (is_member(project_id));



-- Emails

create policy "members read emails"

on public.emails for select using (is_member(project_id));

create policy "members insert emails"

on public.emails for insert with check (is_member(project_id));



-- Outbox

create policy "members read outbox"

on public.email_outbox for select using (true); -- workers may use service role

create policy "members insert outbox"

on public.email_outbox for insert with check (true);

create policy "service update outbox"

on public.email_outbox for update using (true);

