-- Guard Send Transition
-- Prevents sending emails that were canceled mid-flight (race condition protection)

-- Function to guard against sending canceled items
create or replace function public.guard_send_transition()
returns trigger
language plpgsql
as $$
begin
  -- Only check when transitioning to 'sent' from non-sent states
  if new.status = 'sent' and old.status in ('pending','scheduled','sending') then
    -- Ensure it wasn't canceled in a race condition
    if old.status = 'canceled' then
      raise exception 'Send aborted: queue item was canceled';
    end if;
  end if;
  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists trg_guard_send_transition on public.send_queue;

-- Create trigger to enforce guard
create trigger trg_guard_send_transition
before update on public.send_queue
for each row execute function public.guard_send_transition(); 