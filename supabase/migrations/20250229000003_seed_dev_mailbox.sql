-- Seed a dev mailbox for testing
-- This creates a dev mailbox that "sends" without external provider

-- Note: Replace '<user_id>' with an actual user_id or use a function to get the first user
-- For testing, you can manually insert with your user_id

-- Example seed (commented out - run manually with your user_id):
/*
insert into mailboxes (
  user_id,
  provider, 
  display_name, 
  from_email, 
  daily_limit, 
  per_minute_limit, 
  is_active
)
values (
  '<user_id>',  -- Replace with actual user_id
  'dev',
  'Julian (Dev)',
  'julian@example.com', 
  50, 
  5, 
  true
)
returning id;
*/

-- Helper function to get or create a dev mailbox for a user
create or replace function get_or_create_dev_mailbox(p_user_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_mailbox_id uuid;
begin
  -- Try to get existing dev mailbox
  select id into v_mailbox_id
  from mailboxes
  where user_id = p_user_id
    and provider = 'dev'
    and is_active = true
  limit 1;

  -- If not found, create one
  if v_mailbox_id is null then
    insert into mailboxes (
      user_id,
      provider,
      display_name,
      from_email,
      daily_limit,
      per_minute_limit,
      is_active
    )
    values (
      p_user_id,
      'dev',
      'Default Dev Mailbox',
      (select email from auth.users where id = p_user_id limit 1) || '@example.com',
      50,
      5,
      true
    )
    returning id into v_mailbox_id;
  end if;

  return v_mailbox_id;
end;
$$;

