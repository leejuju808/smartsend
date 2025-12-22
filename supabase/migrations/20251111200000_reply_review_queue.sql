-- Reply review queue schema and trigger

create table if not exists public.reply_review_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references public.delivery_events(id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid not null,
  proposed_label text not null,
  score real,
  status text not null default 'open' check (status in ('open','resolved','skipped')),
  decided_label text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  payload jsonb
);

create index if not exists idx_reply_review_open on public.reply_review_items(status) where status = 'open';
create index if not exists idx_reply_review_campaign on public.reply_review_items(campaign_id, status);

create table if not exists public.reply_training_examples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid references public.delivery_events(id) on delete set null,
  subject text,
  text text,
  headers jsonb,
  label text not null,
  source text not null default 'review' check (source in ('review', 'seed', 'import'))
);

create or replace function public.tg_enqueue_low_confidence_review()
returns trigger
language plpgsql
as $$
declare
  v_score real;
  v_label text;
  v_subject text;
  v_text text;
  v_headers jsonb;
begin
  if coalesce(new.type, new.event) <> 'inbound_reply' then
    return new;
  end if;

  v_score := nullif((new.meta ->> 'score'), '')::real;
  v_label := coalesce(new.meta ->> 'label', 'human');
  v_subject := new.meta ->> 'subject';
  v_text := new.meta ->> 'text';
  v_headers := new.meta -> 'headers';

  if v_score is null or v_score between 1.0 and 2.5 then
    insert into public.reply_review_items (event_id, campaign_id, lead_id, proposed_label, score, payload)
    values (
      new.id,
      new.campaign_id,
      new.lead_id,
      v_label,
      v_score,
      jsonb_build_object(
        'subject', v_subject,
        'text', v_text,
        'headers', v_headers
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_low_confidence_review on public.delivery_events;
create trigger trg_enqueue_low_confidence_review
after insert on public.delivery_events
for each row execute function public.tg_enqueue_low_confidence_review();

create or replace function public.apply_reply_review_decision(
  p_review_id uuid,
  p_decided_label text,
  p_user_id uuid
) returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  select r.*, e.meta, e.campaign_id, e.lead_id
    into r
  from public.reply_review_items r
  join public.delivery_events e on e.id = r.event_id
  where r.id = p_review_id
  for update;

  if not found then
    raise exception 'review_item not found';
  end if;

  update public.delivery_events
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('label', p_decided_label, 'reviewed', true)
   where id = r.event_id;

  insert into public.reply_training_examples (event_id, subject, text, headers, label)
  values (
    r.event_id,
    r.payload ->> 'subject',
    r.payload ->> 'text',
    r.payload -> 'headers',
    p_decided_label
  );

  update public.reply_review_items
     set status = 'resolved',
         decided_label = p_decided_label,
         decided_by = p_user_id,
         decided_at = now()
   where id = p_review_id;

  if p_decided_label = 'out_of_office' then
    update public.followup_tasks
       set status = 'paused',
           reason = 'ooo_review'
     where campaign_id = r.campaign_id
       and lead_id = r.lead_id
       and status in ('pending', 'scheduled');

    begin
      insert into public.delivery_events (campaign_id, lead_id, event, type, meta)
      values (
        r.campaign_id,
        r.lead_id,
        'ooo_auto_pause',
        'ooo_auto_pause',
        jsonb_build_object('source', 'review', 'reason', 'ooo_review')
      );
    exception
      when undefined_column then
        insert into public.delivery_events (campaign_id, lead_id, event, meta)
        values (
          r.campaign_id,
          r.lead_id,
          'ooo_auto_pause',
          jsonb_build_object('source', 'review', 'reason', 'ooo_review')
        );
    end;
  else
    perform public.resume_followups_for_lead(r.campaign_id, r.lead_id, 'review_fix');

    begin
      insert into public.delivery_events (campaign_id, lead_id, event, type, meta)
      values (
        r.campaign_id,
        r.lead_id,
        'ooo_auto_resume',
        'ooo_auto_resume',
        jsonb_build_object('source', 'review', 'reason', 'review_fix')
      );
    exception
      when undefined_column then
        insert into public.delivery_events (campaign_id, lead_id, event, meta)
        values (
          r.campaign_id,
          r.lead_id,
          'ooo_auto_resume',
          jsonb_build_object('source', 'review', 'reason', 'review_fix')
        );
    end;
  end if;
end;
$$;

