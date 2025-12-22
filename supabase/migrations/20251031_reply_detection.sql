-- Add reply fields on leads

alter table public.leads
  add column if not exists last_reply_at timestamptz,
  add column if not exists reply_excerpt text;

-- Optional: normalize statuses
-- values you already use: queued/sending/sent/failed/replied (per item) vs lead status
-- ensure leads.status exists and include 'replied'

alter table public.leads
  add column if not exists status text default 'new'; -- new|active|replied|bad|unreachable

-- Store inbound replies

create table if not exists public.inbound_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  campaign_id uuid,
  lead_id uuid,
  from_email text not null,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  is_human_reply boolean not null default false,
  provider text,               -- resend|sendgrid|gmail|...
  raw jsonb,                   -- full payload for audit
  created_at timestamptz not null default now()
);

alter table public.inbound_replies enable row level security;

create policy "replies_owner" on public.inbound_replies
  for select using (user_id is null or auth.uid() = user_id);

-- Cancel future queued items for this lead
create or replace function public.cancel_future_queue(p_lead uuid)
returns void
language sql
security definer
as $$
  update public.send_queue
     set status = 'cancelled'
   where lead_id = p_lead and status in ('queued','sending');
$$;

grant execute on function public.cancel_future_queue(uuid) to authenticated, anon;

