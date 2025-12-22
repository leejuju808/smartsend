-- A) Ensure normalized_messages has AI fields and provider keys
alter table public.normalized_messages
  add column if not exists provider text, -- 'gmail' | 'outlook'
  add column if not exists provider_message_id text,
  add column if not exists ai_label text, -- 'human_reply'|'question'|'positive'|'neutral'|'routing'|'ooh'|'unsubscribe'|'bounce'|'noise'
  add column if not exists ai_confidence numeric, -- 0..1
  add column if not exists ai_model text;

create index if not exists idx_nm_provider_mid on public.normalized_messages(provider, provider_message_id);
create index if not exists idx_nm_need_work on public.normalized_messages(linked_thread_id, direction, ai_label);

-- B) Idempotent inbound upsert (by provider + message id)
create or replace function public.upsert_inbound_message(
  p_provider text,
  p_provider_message_id text,
  p_thread uuid,
  p_campaign uuid,
  p_lead uuid,
  p_subject text,
  p_html text,
  p_preview text,
  p_from_email text,
  p_to_email text,
  p_sent_at timestamptz
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  -- ensure thread is linked to campaign/lead (no-op if already)
  update public.inbox_threads
     set campaign_id = coalesce(campaign_id, p_campaign),
         lead_id     = coalesce(lead_id, p_lead)
   where id = p_thread;

  insert into public.normalized_messages(
    provider, provider_message_id, linked_thread_id, subject, html, preview_clean,
    from_email, to_email, direction, sent_at
  ) values (
    p_provider, p_provider_message_id, p_thread, p_subject, p_html, p_preview,
    p_from_email, p_to_email, 'inbound', p_sent_at
  )
  on conflict (provider, provider_message_id) do update
    set subject = excluded.subject,
        html = excluded.html,
        preview_clean = excluded.preview_clean,
        sent_at = excluded.sent_at
  returning id into v_id;

  -- mark thread as needing attention until AI runs
  update public.inbox_threads set needs_reply = true where id = p_thread;

  return v_id;
end$$;

revoke all on function public.upsert_inbound_message(text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz) from public;
grant execute on function public.upsert_inbound_message(text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz) to authenticated;

-- C) Auto-toggle needs_reply when AI labels arrive
create or replace function public.tg_needs_reply_on_label()
returns trigger language plpgsql security definer as $$
declare
  will_need boolean := false;
begin
  if NEW.direction = 'inbound' then
    -- map labels → needs_reply flag
    if NEW.ai_label in ('human_reply','question','positive','neutral','routing') then
      will_need := true;         -- keep needs_reply true
    elsif NEW.ai_label in ('ooh','unsubscribe','bounce','noise') then
      will_need := false;        -- auto-clear (or leave as is if you prefer)
    end if;

    update public.inbox_threads
       set needs_reply = will_need
     where id = NEW.linked_thread_id;
  end if;
  return NEW;
end$$;

drop trigger if exists trg_needs_reply_on_label on public.normalized_messages;
create trigger trg_needs_reply_on_label
after insert or update of ai_label on public.normalized_messages
for each row execute procedure public.tg_needs_reply_on_label();

-- D) Helper view: messages missing labels (inbound only)
create or replace view public.v_inbound_unlabeled as
select id, linked_thread_id, subject, preview_clean, html, sent_at
from public.normalized_messages
where direction = 'inbound' and (ai_label is null or ai_label = '');


