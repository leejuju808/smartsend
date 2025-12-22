-- Campaign Compliance Footer
-- Adds footer toggle and text to campaigns

alter table public.campaigns
  add column if not exists add_footer boolean default true,
  add column if not exists footer_text text
    default E'--\nYou received this because we believed {{company|your company}} would benefit. Reply ''unsubscribe'' to stop.';

