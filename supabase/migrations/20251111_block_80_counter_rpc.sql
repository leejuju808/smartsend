-- Block 80 counter RPC: increment per-domain send counter (idempotent insert-or-update).

create or replace function public.rpc_inc_domain_counter(
  p_account_id uuid,
  p_domain text,
  p_day date,
  p_n int
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.domain_send_counters(account_id, domain, day, sent_count)
  values (p_account_id, lower(p_domain), p_day, p_n)
  on conflict (account_id, domain, day)
  do update set sent_count = public.domain_send_counters.sent_count + excluded.sent_count;
end;
$$;

