-- E2E Test Assertions Helper
-- Creates a function to assert lead counts by status for a campaign

create or replace function public.assert_counts(
  _campaign_id uuid,
  _queued int,
  _sending int,
  _sent int,
  _failed int,
  _replied int
) returns boolean
language plpgsql as $$
declare
  c_queued  int;
  c_sending int;
  c_sent    int;
  c_failed  int;
  c_rep     int;
begin
  select
    sum((status='queued')::int),
    sum((status='sending')::int),
    sum((status='sent')::int),
    sum((status='failed')::int),
    sum((status='replied')::int)
  into c_queued, c_sending, c_sent, c_failed, c_rep
  from leads where campaign_id = _campaign_id;

  if c_queued = _queued and c_sending = _sending and c_sent = _sent and c_failed = _failed and c_rep = _replied then
    return true;
  else
    raise notice 'Counts mismatch: queued %, sending %, sent %, failed %, replied %', c_queued, c_sending, c_sent, c_failed, c_rep;
    return false;
  end if;
end;
$$;

