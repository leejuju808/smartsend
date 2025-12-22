-- Block 77 QA seed data: default preset and routing examples

-- Default preset with A/B variants
insert into public.nudge_presets (account_id, key, label)
values ('00000000-0000-0000-0000-000000000001', 'default', 'Default follow-up')
on conflict do nothing;

with preset as (
  select id
  from public.nudge_presets
  where account_id = '00000000-0000-0000-0000-000000000001'
    and key = 'default'
  limit 1
)
insert into public.nudge_preset_variants (preset_id, name, weight, subject, body_text)
select id, 'A', 0.6, 'Quick follow-up', 'Hey {{first_name}}, quick nudge on my note — open to a 15-min chat?'
from preset
union all
select id, 'B', 0.4, 'Worth a quick chat?', 'Hi {{first_name}}, curious if this is on your radar. Happy to send a 3-line summary.'
from preset
on conflict do nothing;

-- Routing examples
insert into public.nudge_routing (account_id, label, preset_key)
values
  ('00000000-0000-0000-0000-000000000001', 'ooo', 'ooo_reentry'),
  ('00000000-0000-0000-0000-000000000001', 'oos', 'oos_route'),
  ('00000000-0000-0000-0000-000000000001', 'bounce', 'verify_alt')
on conflict (account_id, label) do update
set preset_key = excluded.preset_key;

-- Additional presets for routed labels
insert into public.nudge_presets (account_id, key, label)
values
  ('00000000-0000-0000-0000-000000000001', 'ooo_reentry', 'We saw your OOO'),
  ('00000000-0000-0000-0000-000000000001', 'oos_route', 'Not the right person?'),
  ('00000000-0000-0000-0000-000000000001', 'verify_alt', 'Bounce → verify email')
on conflict do nothing;

