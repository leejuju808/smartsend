-- Reply fingerprint registry for known autoresponders
create table if not exists public.reply_fingerprints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vendor text not null,
  product text,
  locale text,
  label text not null,
  body_hash text,
  subject_hash text,
  header_key text,
  header_value_regex text,
  weight real not null default 5.0,
  is_active boolean not null default true
);

create index if not exists idx_reply_fingerprints_active
  on public.reply_fingerprints (is_active, label);

create unique index if not exists uq_reply_fingerprints_signature
  on public.reply_fingerprints (
    coalesce(body_hash, ''),
    coalesce(subject_hash, ''),
    coalesce(header_key, ''),
    coalesce(header_value_regex, '')
  );

create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_reply_fingerprints on public.reply_fingerprints;
create trigger trg_touch_reply_fingerprints
  before update on public.reply_fingerprints
  for each row execute function public._touch_updated_at();


