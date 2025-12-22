-- Block 187: Human Handoff + CRM Push - Handoff Settings
-- Adds handoff configuration to campaigns table

alter table public.campaigns
  add column if not exists handoff_mode text
    default 'none'
    check (handoff_mode in ('none','manual','auto')),

  add column if not exists handoff_destination text
    default 'none'
    check (handoff_destination in ('none','pipedrive','hubspot','salesforce','email','slack','discord'));

-- Add index for faster lookups
create index if not exists idx_campaigns_handoff_mode on public.campaigns(handoff_mode);
create index if not exists idx_campaigns_handoff_destination on public.campaigns(handoff_destination);

-- Comments
comment on column public.campaigns.handoff_mode is 'Handoff mode: none (disabled), manual (button only), auto (automatic on hot leads)';
comment on column public.campaigns.handoff_destination is 'Destination for handoff: CRM (pipedrive/hubspot/salesforce) or notification (email/slack/discord)';












