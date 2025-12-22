-- Per-campaign OOO auto-resume settings
create table if not exists public.campaign_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  ooo_resume_enabled boolean not null default true,
  ooo_resume_delay_hours int not null default 24
);

-- Helper view: leads that just expired their OOO pause
create or replace view public.v_leads_ooo_expired as
select cl.*
from public.campaign_leads as cl
join public.campaign_settings as cs on cs.campaign_id = cl.campaign_id
where cl.paused_reason = 'ooo_detected'
  and cl.paused_until is not null
  and cl.paused_until <= now()
  and cs.ooo_resume_enabled = true;





