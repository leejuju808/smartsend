-- Harden reply_drafts table status tracking and helpers

-- A) Status + auditing on reply_drafts
alter table public.reply_drafts
  add column if not exists status text not null default 'draft'
    check (status in ('draft','queued','sent','deleted')),
  add column if not exists queued_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_reply_drafts_campaign_status
  on public.reply_drafts(campaign_id, status, created_at desc);

-- B) RLS for reply_drafts (viewers can read; editors can mutate)
alter table public.reply_drafts enable row level security;

drop policy if exists "drafts_read_members" on public.reply_drafts;
create policy "drafts_read_members" on public.reply_drafts
  for select to authenticated
  using ( public.is_campaign_viewer(campaign_id) );

drop policy if exists "drafts_write_editors" on public.reply_drafts;
create policy "drafts_write_editors" on public.reply_drafts
  for update to authenticated
  using ( public.is_campaign_editor(campaign_id) );

-- C) Safe enqueue helper
create or replace function public.enqueue_reply_draft(p_draft uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  has_queue boolean := false;
begin
  select d.*, t.id as t_id into r
  from public.reply_drafts d
  join public.inbox_threads t on t.id = d.thread_id
  where d.id = p_draft and d.status = 'draft'
  limit 1;

  if not found then
    return false;
  end if;

  -- Check for send_queue existence
  select exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='send_queue'
  ) into has_queue;

  if has_queue then
    insert into public.send_queue(draft_id, campaign_id, thread_id, lead_id, priority, kind)
    values (r.id, r.campaign_id, r.thread_id, r.lead_id, 5, 'reply')
    on conflict do nothing;
  end if;

  update public.reply_drafts
     set status = 'queued',
         queued_at = now()
   where id = r.id;

  return true;
end$$;

revoke all on function public.enqueue_reply_draft(uuid) from public;
grant execute on function public.enqueue_reply_draft(uuid) to authenticated;

-- D) Soft delete helper
create or replace function public.soft_delete_draft(p_draft uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.reply_drafts
     set status = 'deleted', deleted_at = now()
   where id = p_draft and status in ('draft','queued')
  returning true;
$$;

revoke all on function public.soft_delete_draft(uuid) from public;
grant execute on function public.soft_delete_draft(uuid) to authenticated;


