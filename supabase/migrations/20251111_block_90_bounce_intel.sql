-- Block 90 — Bounce Intelligence v2
-- Goal: Turn raw SMTP bounces into actionable outcomes

-- 1) Reason taxonomy
create table if not exists public.bounce_reasons (
  key text primary key,                    -- 'mailbox_full','user_unknown','policy_block','dns_error','rate_limit','content_block','spam_block','temp_error','other'
  label text not null,
  severity smallint not null default 1     -- 1=low 2=med 3=high 4=permanent
);

insert into public.bounce_reasons(key,label,severity) values
('user_unknown','User unknown / 5.1.1',4),
('mailbox_full','Mailbox full / 5.2.2',2),
('policy_block','Policy block (DMARC/SPF/DKIM)',3),
('dns_error','DNS/host not found',3),
('rate_limit','Rate limited / 4.x.x',1),
('content_block','Content policy block',2),
('spam_block','Spam reputation block',3),
('temp_error','Temporary error',1),
('other','Other/Unmapped',1)
on conflict (key) do nothing;

-- 2) Bounce ledger (per message)
create table if not exists public.bounce_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  smtp_code text,                 -- e.g. '550 5.1.1'
  provider text,                  -- gmail,outlook,postfix,etc
  raw_excerpt text,               -- short slice of DSN
  reason_key text references public.bounce_reasons(key),
  action_key text,                -- 'verify_alt','pause_domain','retry_later','remove_lead','adjust_content'
  action_payload jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.9
);

create index if not exists idx_bounce_events_lead on public.bounce_events(lead_id);
create index if not exists idx_bounce_events_msg on public.bounce_events(message_id);

-- 3) Domain suppression window (cooldown on reputation)
create table if not exists public.domain_suppressions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null,
  reason text not null,           -- 'spam_block','rate_limit'
  until timestamptz not null
);

create unique index if not exists uq_domain_suppress on public.domain_suppressions(account_id,domain) where until > now();

-- 4) Lead status flags (ensure exist)
do $$ begin
  alter table public.leads add column if not exists deliverability text;  -- 'valid','unknown','bounced','risk'
exception when duplicate_column then null; end $$;

-- 5) RLS
alter table public.bounce_events enable row level security;
create policy bounce_events_iso on public.bounce_events
  using (
    public.is_account_member(account_id)
    or (
      current_setting('app.account_id', true) is not null
      and current_setting('app.account_id', true)::uuid = account_id
    )
  )
  with check (
    public.is_account_member(account_id)
    or (
      current_setting('app.account_id', true) is not null
      and current_setting('app.account_id', true)::uuid = account_id
    )
  );

alter table public.domain_suppressions enable row level security;
create policy domain_suppress_iso on public.domain_suppressions
  using (
    public.is_account_member(account_id)
    or (
      current_setting('app.account_id', true) is not null
      and current_setting('app.account_id', true)::uuid = account_id
    )
  )
  with check (
    public.is_account_member(account_id)
    or (
      current_setting('app.account_id', true) is not null
      and current_setting('app.account_id', true)::uuid = account_id
    )
  );

