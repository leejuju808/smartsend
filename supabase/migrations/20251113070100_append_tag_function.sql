create or replace function append_tag_to_leads(lead_ids uuid[], new_tag text)
returns void as $$
begin
  update public.leads
  set tags = array_append(coalesce(tags, '{}'::text[]), new_tag)
  where id = any(lead_ids);
end;
$$ language plpgsql;

