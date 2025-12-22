-- Block 83 QA smoke data
-- This script seeds a sample thread with neutral stance and a price objection for manual verification.

insert into public.accounts(id, name)
values ('00000000-0000-0000-0000-000000000083', 'QA Block 83')
on conflict (id) do nothing;

insert into public.leads(id, account_id, email, name)
values (
  '00000000-0000-0000-0000-000000000183',
  '00000000-0000-0000-0000-000000000083',
  'qa+block83@example.com',
  'QA Block 83 Lead'
)
on conflict (id) do nothing;

insert into public.messages(id, account_id, lead_id, thread_id, direction, subject, body_text, received_at)
values (
  '00000000-0000-0000-0000-000000000283',
  '00000000-0000-0000-0000-000000000083',
  '00000000-0000-0000-0000-000000000183',
  '00000000-0000-0000-0000-000000000383',
  'inbound',
  'Re: SmartSend pricing',
  'Hey there, this looks interesting but the pricing feels steep for our budget this quarter.',
  now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.messages(id, account_id, lead_id, thread_id, direction, subject, body_text, received_at)
values (
  '00000000-0000-0000-0000-000000000284',
  '00000000-0000-0000-0000-000000000083',
  '00000000-0000-0000-0000-000000000183',
  '00000000-0000-0000-0000-000000000383',
  'outbound',
  'Re: SmartSend pricing',
  'Thanks for the note! Happy to walk through flexible options if you have time this week.',
  now() - interval '12 hours'
)
on conflict (id) do nothing;

-- Optional: invoke thread intel function manually
-- select net.http_post(
--   url := current_setting('app.settings.thread_intel_url', true),
--   body := jsonb_build_object('thread_id', '00000000-0000-0000-0000-000000000383')::text
-- );

