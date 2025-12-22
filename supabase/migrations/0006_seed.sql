-- Create a demo project + data (run with service role or in SQL Editor)

insert into public.projects (id, name) values

  (uuid_generate_v4(), 'SmartSend Demo')

on conflict do nothing;



-- Pick the created id for subsequent inserts:

-- SELECT id FROM public.projects WHERE name='SmartSend Demo';

-- Replace below :project with that UUID before running.



-- Add yourself as member (run while logged in so auth.uid() works):

-- insert into public.project_members (project_id, user_id) values (:project, auth.uid());



-- Leads

insert into public.leads (project_id, email, name)

values

  (:project, 'maria@acme.com', 'Maria'),

  (:project, 'leo@orbit.io', 'Leo')

on conflict do nothing;



-- Threads

insert into public.threads (id, project_id, lead_id, status)

select uuid_generate_v4(), :project, l.id, 'open'

from public.leads l where l.project_id = :project;



-- Emails (sample conversation)

do $$

declare th uuid;

begin

  select t.id into th from public.threads t

  join public.leads l on l.id=t.lead_id

  where l.email='maria@acme.com' and t.project_id=:project limit 1;



  insert into public.emails (project_id, thread_id, direction, subject, body, sender, recipient, created_at)

  values

    (:project, th, 'inbound', 'Quick question', 'Hi! Can you share pricing?', 'maria@acme.com','sales@smartsendhq.com', now() - interval '2 hours'),

    (:project, th, 'outbound','Re: Quick question', 'Absolutely—$99 Starter, $299 Pro.', 'sales@smartsendhq.com','maria@acme.com', now() - interval '90 minutes'),

    (:project, th, 'inbound', 'Re: Quick question', 'Thanks! Is there an annual discount?', 'maria@acme.com','sales@smartsendhq.com', now() - interval '30 minutes');

end $$;

