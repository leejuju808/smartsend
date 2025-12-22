-- Seed default nudge templates for existing campaigns (idempotent)

insert into public.nudge_templates (campaign_id, tone, scenario, subject, body)
select c.id, x.tone, x.scenario, x.subject, x.body
from public.campaigns c
cross join (values
  ('professional','no_reply','Quick follow-up','Hi {lead_first},\n\nCircling back on this. {cta}\n\n{booking_link}\n\n— {me}'),
  ('friendly','question','Happy to clarify (quick)','Hey {lead_first},\n\nSaw your question — want me to shoot over a quick 1–2 line answer or grab {duration} min?\n\n{booking_link}\n\n— {me}'),
  ('concise','positive','Lock a time?','{lead_first},\n\nGreat — want me to lock {duration} min?\n{booking_link}\n\n— {me}')
) as x(tone,scenario,subject,body)
where not exists (
  select 1
  from public.nudge_templates nt
  where nt.campaign_id = c.id
    and nt.tone = x.tone
    and nt.scenario = x.scenario
);

