-- Sequence Templates Library v1 - Seed Data
-- Block 401: Starter library of sequence templates

-- SMB 4-Step Warm Outreach
insert into public.sequence_templates (name, description, persona)
values ('SMB Warm Outreach — 4 Step', '4-step warm outreach optimized for SMB owners.', 'SMB')
on conflict do nothing;

-- Insert steps for the template
do $$
declare
  template_uuid uuid;
begin
  -- Get the template ID
  select id into template_uuid
  from public.sequence_templates
  where name = 'SMB Warm Outreach — 4 Step'
  limit 1;

  -- Only insert if template exists
  if template_uuid is not null then
    -- Insert steps, ignoring conflicts
    insert into public.sequence_template_steps (template_id, step_number, delay_hours, subject, body)
    values
      (template_uuid, 1, 0, 'Quick question about {{business}}', 'Hi {{first_name}},

Had a quick idea about {{business}}…'),
      (template_uuid, 2, 24, 'Wanted to send this over', 'Hi again {{first_name}}, circling back on the idea I shared.'),
      (template_uuid, 3, 72, 'Can I be honest?', 'Figured I''d shoot straight — I think we can help you get {{value_prop}}.'),
      (template_uuid, 4, 168, 'Last try — worth a look?', 'Promise this is my last email. Worth 10 seconds?')
    on conflict (template_id, step_number) do nothing;
  end if;
end $$;

