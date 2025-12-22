-- Log every inbound email for audit/debug/analytics
create table if not exists public.inbound_emails (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,            -- 'mailgun' | 'sendgrid'
  message_id text,                   -- provider's message-id when present
  in_reply_to text,                  -- In-Reply-To header
  references_hdr text,               -- References header
  from_email text not null,
  to_email text not null,
  subject text,
  body_text text,
  body_html text,
  raw jsonb,                         -- raw provider payload (sanitized)
  received_at timestamptz not null default now(),
  handled boolean not null default false,
  handler_note text
);

alter table public.inbound_emails enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inbound_emails' and policyname='own inbound'
  ) then
    create policy "own inbound" on public.inbound_emails
      for all using (auth.uid() = profile_id);
  end if;
end$$;

create index if not exists idx_inbound_profile_received on public.inbound_emails(profile_id, received_at desc);
create index if not exists idx_inbound_message_id on public.inbound_emails(message_id);
create index if not exists idx_inbound_from on public.inbound_emails(from_email);
create index if not exists idx_inbound_inreply on public.inbound_emails(in_reply_to);

-- Helpful FK if you later want to link back
alter table public.messages
  add column if not exists inbound_id uuid references public.inbound_emails(id) on delete set null;
