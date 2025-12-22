-- 8240_unsubscribe_tokens.sql
-- Unsubscribe System: Unique Links + Token Management
-- Creates table for unsubscribe tokens and function to generate/reuse tokens

-- 1) Table for unsubscribe tokens
create table if not exists public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  -- Optional: link to your contacts table if you have one
  contact_id uuid
    references public.contacts(id),

  -- Raw email to target (for when you only have email)
  email citext not null,

  -- Random token used in the URL: /u/{token}
  token text not null unique,

  -- Has this link been used to unsubscribe?
  unsubscribed_at timestamptz,
  unsubscribed_ip inet,
  user_agent text,

  source text check (
    source in ('footer_link', 'manual', 'api')
  ) default 'footer_link',

  created_at timestamptz not null default now()
);

-- Basic index to look up by workspace+email if needed
create index if not exists unsubscribe_tokens_workspace_email_idx
  on public.unsubscribe_tokens (workspace_id, email);

-- Index for token lookups (used when processing unsubscribe clicks)
create index if not exists unsubscribe_tokens_token_idx
  on public.unsubscribe_tokens (token);

-- RLS (same workspace-based pattern as other tables)
alter table public.unsubscribe_tokens enable row level security;

create policy "Workspace members can read unsubscribe tokens"
on public.unsubscribe_tokens
for select
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can insert unsubscribe tokens"
on public.unsubscribe_tokens
for insert
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can update unsubscribe tokens"
on public.unsubscribe_tokens
for update
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

-- 2) Function: create or reuse an unsubscribe token per (workspace, email)
-- Generate or reuse an unsubscribe token for this workspace+email
create or replace function public.get_or_create_unsubscribe_token(
  p_workspace_id uuid,
  p_email text,
  p_contact_id uuid default null
)
returns text
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  -- 1) Try to reuse existing token
  select token
  into v_token
  from public.unsubscribe_tokens
  where workspace_id = p_workspace_id
    and email = p_email::citext
  order by created_at asc
  limit 1;

  if v_token is not null then
    return v_token;
  end if;

  -- 2) Create new token
  v_token := encode(gen_random_bytes(24), 'hex'); -- 48-char random string

  insert into public.unsubscribe_tokens (
    workspace_id,
    contact_id,
    email,
    token,
    source
  )
  values (
    p_workspace_id,
    p_contact_id,
    p_email::citext,
    v_token,
    'footer_link'
  );

  return v_token;
end;
$$;

grant execute on function public.get_or_create_unsubscribe_token(uuid, text, uuid)
  to authenticated;

































































