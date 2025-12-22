do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'reply_detections_intent_check'
       and conrelid = 'public.reply_detections'::regclass
  ) then
    alter table public.reply_detections
      drop constraint reply_detections_intent_check;
  end if;
exception
  when undefined_table then
    null;
end;
$$;

alter table if exists public.reply_detections
  add constraint reply_detections_intent_check
  check (
    intent in (
      'replied',
      'out_of_office',
      'not_interested',
      'scheduling',
      'question',
      'neutral',
      'unclear',
      'ooo',
      'unsubscribe',
      'positive',
      'negative',
      'routing',
      'unknown'
    )
  );

