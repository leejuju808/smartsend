create or replace function public.track_open_rpc(p_queue_id uuid, p_ip text, p_ua text)
returns void language plpgsql as $$
begin
  update public.send_queue set open_count = open_count + 1 where id = p_queue_id;
  insert into public.email_open_events(queue_id, ip, ua) values (p_queue_id, p_ip, p_ua);
end $$;


create or replace function public.track_click_rpc(p_queue_id uuid, p_url text, p_ip text, p_ua text)
returns void language plpgsql as $$
begin
  update public.send_queue set click_count = click_count + 1 where id = p_queue_id;
  insert into public.email_click_events(queue_id, url, ip, ua) values (p_queue_id, p_url, p_ip, p_ua);
end $$;


grant execute on function public.track_open_rpc(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.track_click_rpc(uuid, text, text, text) to anon, authenticated, service_role;















