-- Helpful indexes for lookup by email and state
create index if not exists leads_email_idx on public.leads (email);
create index if not exists leads_email_status_idx on public.leads (email, status);

-- Optional RPC if you want to call it from client securely (we're using service role in the function)
-- create or replace function public.mark_replied_and_halt(p_lead uuid) returns void
-- language plpgsql security definer as $$
-- begin
--   update public.leads set status='replied', updated_at=now() where id = p_lead;
--   delete from public.send_queue where lead_id = p_lead and status='queued';
--   -- campaign_logs insert would happen in app layer or here with more context
-- end$$;

-- (Optional) If you also store message→lead mapping, create table for better joins
-- create table if not exists public.email_threads (
--   id uuid primary key default gen_random_uuid(),
--   provider text,
--   thread_id text,
--   campaign_id uuid references public.campaigns(id) on delete cascade,
--   lead_id uuid references public.leads(id) on delete cascade,
--   created_at timestamptz default now()
-- );
-- create index if not exists email_threads_thread_idx on public.email_threads (thread_id);
