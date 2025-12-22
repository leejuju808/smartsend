-- Block 400 — Meeting Reply Helper v1
-- Add booking_link column to workspaces table

alter table public.workspaces
add column if not exists booking_link text;

-- Optional index for booking_link queries
create index if not exists idx_workspaces_booking_link
  on public.workspaces (booking_link)
  where booking_link is not null;




