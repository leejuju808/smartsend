-- Steps in a sequence (linked to a campaign)
create table if not exists public.sequence_steps (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  step_number int not null,
  subject text not null,
  body text not null,
  delay_days int not null,
  created_at timestamp with time zone default now()
);

create index if not exists sequence_steps_campaign_id_idx on public.sequence_steps(campaign_id);

