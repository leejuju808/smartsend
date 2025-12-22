-- Core inbound store (generic — works for Gmail/Outlook or SMTP intake)

create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  provider text check (provider in ('gmail','outlook','smtp','other')) default 'other',
  thread_id text,                 -- provider thread/conversation id
  message_id text,                -- provider message id
  direction text check (direction in ('inbound','outbound')) not null,
  from_email text,
  to_email text[],
  subject text,
  body_text text,
  body_html text,
  headers jsonb,
  received_at timestamptz default now(),

  -- AI / rules classification
  classification_label text,             -- 'human','ooo','bounce','unsubscribe','spam','unknown'
  human_reply boolean default false,     -- true if we consider it a real reply
  ooo boolean default false,
  unsubscribe boolean default false,
  bounce boolean default false,
  spam boolean default false,

  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_email_messages_team on email_messages(team_id);
create index if not exists idx_email_messages_campaign on email_messages(campaign_id);
create index if not exists idx_email_messages_lead on email_messages(lead_id);
create index if not exists idx_email_messages_thread on email_messages(thread_id);

-- RLS
alter table email_messages enable row level security;

create policy "team_members_can_read_msgs"
  on email_messages for select
  using (public.is_team_member(team_id));

create policy "server_or_admin_insert_msgs"
  on email_messages for insert
  with check (public.is_team_admin(team_id));  -- UI/Edge uses service role; UI can also gate by admin

-- Lead status + campaign metrics updates when a human reply lands
-- 1) Add status if not present
alter table leads
  add column if not exists status text;  -- values: 'new','sent','replied','nurture','closed'

-- 2) Trigger function: when email_messages.human_reply flips to true, mark lead as replied
create or replace function public.mark_lead_replied()
returns trigger language plpgsql as $$
begin
  if (NEW.human_reply is true) then
    update leads
      set status = 'replied'
    where id = NEW.lead_id
      and coalesce(status,'') <> 'replied';

    -- optional: campaign counters table if you keep one
    -- update campaign_stats set replies = replies + 1 where campaign_id = NEW.campaign_id;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_mark_lead_replied on email_messages;
create trigger trg_mark_lead_replied
after insert or update of human_reply on email_messages
for each row execute function public.mark_lead_replied();
