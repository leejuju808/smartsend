-- Replies Inbox Enhancements
-- Adds is_read, campaign_id denormalization, full-text search, and performance indexes

-- 1. Ensure replies has is_read
alter table replies
  add column if not exists is_read boolean not null default false;

-- 2. Denormalize campaign_id for fast filtering (kept in sync via FK to leads)
alter table replies
  add column if not exists campaign_id uuid;

-- Update existing rows
update replies r
set campaign_id = l.campaign_id
from leads l
where r.lead_id = l.id and r.campaign_id is null;

-- Keep campaign_id current if lead moves (rare, but safe)
create or replace function set_reply_campaign()
returns trigger as $$
begin
  update replies set campaign_id = new.campaign_id where lead_id = new.id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_campaign_update on leads;
create trigger trg_leads_campaign_update
after update of campaign_id on leads
for each row execute procedure set_reply_campaign();

-- 3. Full-text search vector on subject/body
alter table replies
  add column if not exists search_tsv tsvector;

-- Update existing rows
update replies
set search_tsv = to_tsvector('simple',
  coalesce(subject,'') || ' ' || coalesce(body,''));

create index if not exists idx_replies_tsv on replies using gin (search_tsv);

-- Trigger to keep tsvector updated
create or replace function replies_tsvector_refresh()
returns trigger as $$
begin
  new.search_tsv := to_tsvector('simple',
    coalesce(new.subject,'') || ' ' || coalesce(new.body,''));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_replies_tsv on replies;
create trigger trg_replies_tsv
before insert or update of subject, body on replies
for each row execute procedure replies_tsvector_refresh();

-- 4. Filter/sort indexes
create index if not exists idx_replies_campaign_reply_read_created
  on replies (campaign_id, is_reply, is_read, created_at desc);
create index if not exists idx_replies_lead_created
  on replies (lead_id, created_at desc);

-- 5. RPC function for fast search with filters
create or replace function search_replies(
  q text,
  campaign uuid default null,
  only_unread boolean default false,
  human_only boolean default false,
  auto_only boolean default false,
  from_idx int default 0,
  to_idx int default 24
)
returns table (
  id uuid,
  subject text,
  body text,
  is_reply boolean,
  is_read boolean,
  created_at timestamptz,
  lead_id uuid,
  campaign_id uuid,
  leads jsonb,
  count bigint
) language sql stable as $$
  with base as (
    select r.*, to_jsonb(l.*) as leads_json
    from replies r
    left join leads l on l.id = r.lead_id
    where
      (campaign is null or r.campaign_id = campaign) and
      (not only_unread or r.is_read = false) and
      (not human_only or r.is_reply = true) and
      (not auto_only or r.is_reply = false) and
      (q is null or length(q) < 2 or r.search_tsv @@ plainto_tsquery('simple', q))
  ),
  counted as (
    select *, (select count(*) from base) as total_count
    from base
    order by created_at desc
    offset from_idx limit (to_idx - from_idx + 1)
  )
  select id, subject, body, is_reply, is_read, created_at, lead_id, campaign_id, leads_json as leads, total_count as count
  from counted;
$$;

-- 6. Update RLS policies for team-based access
drop policy if exists "users_select_replies" on public.replies;
create policy "users_select_replies" on public.replies
  for select to authenticated
  using (
    exists (
      select 1 from team_members tm
      join leads l on l.team_id = tm.team_id
      where l.id = replies.lead_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "users_update_replies" on public.replies;
create policy "users_update_replies" on public.replies
  for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      join leads l on l.team_id = tm.team_id
      where l.id = replies.lead_id and tm.user_id = auth.uid()
    )
  );

-- Grant execute on search_replies to authenticated users
grant execute on function search_replies to authenticated;

