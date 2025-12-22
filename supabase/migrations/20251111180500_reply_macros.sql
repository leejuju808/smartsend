-- Reply Macros library, hydration helper, analytics, and seeds (idempotent)

-- Core table storing campaign-specific reply macros
create table if not exists public.reply_macros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  key text not null,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  tags text[] default '{}',
  unique (campaign_id, key)
);

create index if not exists idx_reply_macros_campaign
  on public.reply_macros(campaign_id);

-- Usage logging table to capture macro insertions in inbox threads
create table if not exists public.reply_macro_uses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  macro_id uuid not null references public.reply_macros(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  user_id uuid references auth.users(id),
  variant text,
  hydrated_vars jsonb
);

create index if not exists idx_reply_macro_uses_macro
  on public.reply_macro_uses(macro_id);

create index if not exists idx_reply_macro_uses_thread
  on public.reply_macro_uses(thread_id);

-- Row Level Security configuration
alter table public.reply_macros enable row level security;
alter table public.reply_macro_uses enable row level security;

drop policy if exists "macros_rw" on public.reply_macros;
create policy "macros_rw" on public.reply_macros
  for all
  using (public.is_campaign_member(campaign_id))
  with check (public.is_campaign_member(campaign_id, auth.uid(), array['owner','editor']));

drop policy if exists "macro_uses_r" on public.reply_macro_uses;
create policy "macro_uses_r" on public.reply_macro_uses
  for select using (true);

drop policy if exists "macro_uses_i" on public.reply_macro_uses;
create policy "macro_uses_i" on public.reply_macro_uses
  for insert with check (true);

-- Maintain updated_at
drop trigger if exists reply_macros_set_updated_at on public.reply_macros;
create trigger reply_macros_set_updated_at
  before update on public.reply_macros
  for each row
  execute function public.handle_updated_at();

-- Hydration helper: replaces {{tokens}} with lead data and convenience values
create or replace function public.macro_hydrate(p_thread uuid, p_text text, p_vars jsonb default '{}'::jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_lead uuid;
  out_text text := coalesce(p_text, '');
  fn text;
  ln text;
  co text;
  em text;
begin
  select t.lead_id into v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  if v_lead is null then
    return out_text;
  end if;

  select first_name, last_name, company, email
  into fn, ln, co, em
  from public.leads
  where id = v_lead;

  out_text := replace(out_text, '{{first_name}}', coalesce(nullif(fn, ''), 'there'));
  out_text := replace(out_text, '{{last_name}}', coalesce(ln, ''));
  out_text := replace(out_text, '{{company}}', coalesce(co, 'your team'));
  out_text := replace(out_text, '{{email}}', coalesce(em, ''));
  out_text := replace(out_text, '{{today}}', to_char(now(), 'Mon FMDD, YYYY'));
  out_text := replace(out_text, '{{weekday}}', to_char(now(), 'FMDay'));

  if p_vars is not null then
    for r in select key, value from jsonb_each_text(p_vars) loop
      out_text := replace(out_text, '{{' || r.key || '}}', r.value);
    end loop;
  end if;

  out_text := regexp_replace(out_text, '{{[^}]+}}', '', 'g');

  return out_text;
end;
$$;

-- Seven-day usage metrics
create or replace view public.v_macro_usage_7d as
select
  m.campaign_id,
  m.id,
  m.key,
  m.title,
  m.is_active,
  count(u.id) as uses_7d
from public.reply_macros m
left join public.reply_macro_uses u
  on u.macro_id = m.id
 and u.created_at >= now() - interval '7 days'
group by m.campaign_id, m.id, m.key, m.title, m.is_active
order by uses_7d desc, m.key;

-- Starter macro seed data (noop if already present)
insert into public.reply_macros (campaign_id, key, title, body, tags)
values
  ('00000000-0000-0000-0000-000000000001','clarify','Clarify question','Thanks {{first_name}} — quick clarify: is this for {{company}}''s inbound leads or outbound campaigns?','{question,clarify}'),
  ('00000000-0000-0000-0000-000000000001','pricing','Pricing overview','For small teams at {{company}}, plans start at $149/mo. If helpful, I can send a one-pager or set up a 10-min fit check.','{pricing,overview}'),
  ('00000000-0000-0000-0000-000000000001','book_15','Offer 15-min','Happy to help {{first_name}} — does Tue or Thu afternoon work for a 15-min fit check? I can send a hold.','{schedule,cta}')
on conflict do nothing;


