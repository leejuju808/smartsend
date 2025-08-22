-- DEALS table and lead scoring
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  stage text check (stage in ('Contacted','Replied','Demo Scheduled','Proposal Sent','Closed Won','Closed Lost')) default 'Contacted',
  value numeric,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists deals_workspace_idx on public.deals(workspace_id, stage);
create index if not exists deals_contact_idx on public.deals(contact_id);

-- Basic RLS: members of the workspace can access
alter table if exists public.deals enable row level security;

drop policy if exists "deals_member_all" on public.deals;
create policy "deals_member_all" on public.deals
  for all using (
    exists (select 1 from public.workspace_members m where m.workspace_id = deals.workspace_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members m where m.workspace_id = deals.workspace_id and m.user_id = auth.uid())
  );

-- Lead score on contacts
alter table if exists public.contacts add column if not exists lead_score int default 0;

-- Helper function to bump lead score safely
create or replace function public.bump_lead_score(c_id uuid, inc int)
returns void language plpgsql as $$
begin
  update public.contacts set lead_score = greatest(0, coalesce(lead_score,0) + inc)
  where id = c_id;
end; $$;

-- Scoring triggers based on events
-- +10 on 2nd unique open for a campaign_contact
create or replace function public.on_email_open_bump_score()
returns trigger language plpgsql as $$
declare
  c_id uuid;
  open_count int;
begin
  select contact_id into c_id from public.campaign_contacts where id = new.campaign_contact_id;
  if c_id is null then return new; end if;
  select count(*) into open_count from public.email_opens where campaign_contact_id = new.campaign_contact_id;
  if open_count = 2 then
    perform public.bump_lead_score(c_id, 10);
  end if;
  return new;
end; $$;

drop trigger if exists trg_email_open_bump on public.email_opens;
create trigger trg_email_open_bump after insert on public.email_opens
for each row execute function public.on_email_open_bump_score();

-- +20 on first click
create or replace function public.on_email_click_bump_score()
returns trigger language plpgsql as $$
declare c_id uuid; clicked int; begin
  select contact_id into c_id from public.campaign_contacts where id = new.campaign_contact_id;
  if c_id is null then return new; end if;
  select count(*) into clicked from public.email_clicks where campaign_contact_id = new.campaign_contact_id;
  if clicked = 1 then
    perform public.bump_lead_score(c_id, 20);
  end if;
  return new;
end; $$;

drop trigger if exists trg_email_click_bump on public.email_clicks;
create trigger trg_email_click_bump after insert on public.email_clicks
for each row execute function public.on_email_click_bump_score();

-- +50 on first reply, and auto-create deal if missing
create or replace function public.on_email_reply_bump_and_deal()
returns trigger language plpgsql as $$
declare
  c_id uuid;
  ws_id uuid;
  d_id uuid;
  deal_name text;
begin
  select contact_id, workspace_id into c_id, ws_id from public.campaign_contacts where id = new.campaign_contact_id;
  if c_id is null then return new; end if;
  -- bump once on first reply for this contact in this workspace
  if not exists (
    select 1 from public.email_replies r
    join public.campaign_contacts cc on cc.id = r.campaign_contact_id
    where cc.contact_id = c_id and cc.workspace_id = ws_id and r.id = new.id
  ) then
    perform public.bump_lead_score(c_id, 50);
  end if;
  -- ensure a deal exists
  select id into d_id from public.deals where contact_id = c_id and workspace_id = ws_id order by created_at desc limit 1;
  if d_id is null then
    select coalesce(name, email) into deal_name from public.contacts where id = c_id;
    insert into public.deals(workspace_id, contact_id, name, stage)
    values (ws_id, c_id, coalesce(deal_name, 'New Deal'), 'Replied');
  else
    update public.deals set stage = 'Replied', updated_at = now() where id = d_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_email_reply_bump on public.email_replies;
create trigger trg_email_reply_bump after insert on public.email_replies
for each row execute function public.on_email_reply_bump_and_deal();

