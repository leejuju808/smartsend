-- Ensure unique leads per campaign by email
-- Note: this assumes email is already normalized (trimmed/lowercased) upstream
create unique index if not exists leads_campaign_email_uniq
  on public.leads (campaign_id, email);


