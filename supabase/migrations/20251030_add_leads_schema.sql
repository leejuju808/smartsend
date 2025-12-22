-- Add helpful indexes and updated_at trigger for leads import

create unique index if not exists leads_unique_campaign_email on public.leads (campaign_id, lower(email)) where campaign_id is not null;

create index if not exists leads_campaign_status_idx on public.leads (campaign_id, status);
create index if not exists leads_created_idx on public.leads (created_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();


