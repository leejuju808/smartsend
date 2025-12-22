create or replace function incr_message_field(p_id uuid, p_field text)
returns void language plpgsql as $$
begin
  execute format('update campaign_messages set %I = %I + 1, last_open_at = now() where id = $1', p_field, p_field) using p_id;
end $$;