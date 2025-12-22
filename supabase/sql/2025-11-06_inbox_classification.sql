-- Inbox classification rules, functions, and triggers
-- Run in Supabase SQL (idempotent)

-- Extensions -----------------------------------------------------------------
create extension if not exists citext;

-- A) Ensure classification columns exist -------------------------------------
alter table public.inbox_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric,
  add column if not exists classified_at timestamptz;

create index if not exists idx_messages_ai_label on public.inbox_messages(ai_label);
create index if not exists idx_messages_created on public.inbox_messages(created_at desc);

-- B) Rule tables (trainable without redeploy) ---------------------------------
create table if not exists public.reply_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null check (label in ('positive','neutral','question','ooo','unsubscribe','bounce','negative','auto')),
  phrase citext not null,
  weight numeric not null default 1.0,
  lang text default 'any',
  unique (label, phrase)
);

create index if not exists idx_reply_rules_label on public.reply_rules(label);

insert into public.reply_rules(label, phrase, weight) values
  ('unsubscribe','unsubscribe',3), ('unsubscribe','remove me',3), ('unsubscribe','opt out',3), ('unsubscribe','stop emailing',3),
  ('positive','sounds good',2), ('positive','let’s talk',2), ('positive','schedule',1.5), ('positive','book a call',2), ('positive','interested',2.5),
  ('question','?',0.8), ('question','can you',1), ('question','how do',1), ('question','what is',1),
  ('ooo','out of office',2), ('ooo','vacation',1.5), ('ooo','automatic reply',2),
  ('negative','not interested',2.5), ('negative','no thanks',2), ('negative','stop',1.5),
  ('auto','mailer-daemon',3), ('auto','delivery has failed',3), ('auto','undeliverable',3)
on conflict do nothing;

-- C) Heuristic classifier -----------------------------------------------------
create or replace function public.classify_inbound_reply(p_subject text, p_body text)
returns table(label text, confidence numeric)
language plpgsql
stable
as $$
declare
  v_sub text := coalesce(lower(p_subject),'');
  v_body text := coalesce(lower(p_body),'');
  v_text text := substring((v_sub || ' ' || v_body) from 1 for 4000);
  v_sc_unsub numeric := 0;
  v_sc_pos numeric := 0;
  v_sc_q numeric := 0;
  v_sc_ooo numeric := 0;
  v_sc_neg numeric := 0;
  v_sc_auto numeric := 0;
  v_label text;
  v_conf numeric := 0;
begin
  if v_text ~* '(undeliverable|delivery status notification|mail(er|)-daemon|failed permanently)' then
    return query select 'bounce'::text, 1.0::numeric;
    return;
  end if;

  select coalesce(sum(weight),0) into v_sc_unsub from public.reply_rules where label='unsubscribe' and (v_text ilike '%'||phrase||'%');
  select coalesce(sum(weight),0) into v_sc_pos   from public.reply_rules where label='positive'     and (v_text ilike '%'||phrase||'%');
  select coalesce(sum(weight),0) into v_sc_q     from public.reply_rules where label='question'     and (v_text ilike '%'||phrase||'%');
  select coalesce(sum(weight),0) into v_sc_ooo   from public.reply_rules where label='ooo'          and (v_text ilike '%'||phrase||'%');
  select coalesce(sum(weight),0) into v_sc_neg   from public.reply_rules where label='negative'     and (v_text ilike '%'||phrase||'%');
  select coalesce(sum(weight),0) into v_sc_auto  from public.reply_rules where label='auto'         and (v_text ilike '%'||phrase||'%');

  v_label := 'unknown';

  if v_sc_unsub >= greatest(v_sc_pos,v_sc_q,v_sc_ooo,v_sc_neg,v_sc_auto,0) and v_sc_unsub >= 2 then
    v_label := 'unsubscribe'; v_conf := least(1, v_sc_unsub/3);
  elsif v_sc_auto >= greatest(v_sc_pos,v_sc_q,v_sc_ooo,v_sc_neg,0) and v_sc_auto >= 2 then
    v_label := 'bounce'; v_conf := least(1, v_sc_auto/3);
  elsif v_sc_ooo >= greatest(v_sc_pos,v_sc_q,v_sc_neg,0) and v_sc_ooo >= 1.5 then
    v_label := 'ooo'; v_conf := least(1, v_sc_ooo/3);
  elsif v_sc_pos >= greatest(v_sc_q,v_sc_neg,0) and v_sc_pos >= 1.5 then
    v_label := 'positive'; v_conf := least(1, v_sc_pos/3);
  elsif v_sc_q >= greatest(v_sc_neg,0) and v_sc_q >= 1 then
    v_label := 'question'; v_conf := least(1, v_sc_q/3);
  elsif v_sc_neg >= 1.5 then
    v_label := 'negative'; v_conf := least(1, v_sc_neg/3);
  else
    if v_text ~* '\b(yes|sure|works|interested)\b' then
      v_label := 'positive'; v_conf := 0.6;
    elsif v_text ~* '\b(no|not now)\b' then
      v_label := 'negative'; v_conf := 0.6;
    elsif v_text ~* '\b(thanks|thank you)\b' then
      v_label := 'neutral'; v_conf := 0.5;
    else
      v_label := 'neutral'; v_conf := 0.3;
    end if;
  end if;

  return query select v_label, v_conf;
end;
$$;

-- D) Trigger: auto-classify inbound messages lacking ai_label -----------------
create or replace function public.trg_classify_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_conf numeric;
begin
  if coalesce(new.direction,'in') <> 'in' then
    return new;
  end if;

  if new.ai_label is null then
    select label, confidence into v_label, v_conf
    from public.classify_inbound_reply(new.subject, coalesce(new.body_text, new.body_html));

    new.ai_label := v_label;
    new.ai_confidence := v_conf;
    new.classified_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_classify_inbound on public.inbox_messages;
create trigger trg_classify_inbound
before insert on public.inbox_messages
for each row execute function public.trg_classify_inbound();

-- E) Auto-mark thread replied + cancel future sends ---------------------------
create or replace function public.trg_reply_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_stop boolean := false;
  v_is_reply boolean := false;
begin
  if coalesce(new.direction,'in') <> 'in' then
    return new;
  end if;

  if new.ai_label in ('positive','question','neutral') then
    v_is_reply := true; v_should_stop := true;
  elsif new.ai_label = 'unsubscribe' then
    v_is_reply := false; v_should_stop := true;
  elsif new.ai_label = 'negative' then
    v_is_reply := true; v_should_stop := true;
  elsif new.ai_label = 'ooo' then
    v_is_reply := false; v_should_stop := false;
  end if;

  if v_is_reply then
    update public.inbox_threads
       set replied_at = coalesce(replied_at, new.created_at),
           stopped_by_reply = coalesce(stopped_by_reply, true),
           updated_at = greatest(updated_at, now())
     where id = new.thread_id;

    perform public.cancel_future_queue_for_thread(new.thread_id);
    perform public.reconcile_last_send_for_thread(new.thread_id, 'reply', coalesce(new.created_at, now()));
  end if;

  if v_should_stop and not v_is_reply then
    perform public.cancel_future_queue_for_thread(new.thread_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reply_flow on public.inbox_messages;
create trigger trg_reply_flow
after insert or update of ai_label on public.inbox_messages
for each row execute function public.trg_reply_flow();













