-- Step 1 — DB: per-contact sequence pause + OOO facts
-- Pause state lives at the campaign-contact level

alter table public.campaign_contacts
  add column if not exists is_paused boolean not null default false,
  add column if not exists pause_reason text check (pause_reason in ('ooo','manual','bounce','complaint')),
  add column if not exists pause_until date,     -- auto-resume date if known
  add column if not exists ooo_detected_at timestamptz,
  add column if not exists ooo_return_date date, -- extracted from reply
  add column if not exists ooo_notes text;       -- raw snippet / parse note

-- Create index for efficient pause queries
create index if not exists idx_campaign_contacts_paused on public.campaign_contacts(is_paused, pause_until) 
  where is_paused = true;

-- Step 2 — Stamp on scheduled messages so the queue knows they were paused
alter table public.scheduled_messages
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text;

-- Also add to send_queue (primary queue table)
alter table public.send_queue
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text;

-- Create index for paused queue items
create index if not exists idx_send_queue_paused on public.send_queue(paused_at, pause_reason) 
  where paused_at is not null;

-- Step 3 — Classifier label: OOO
-- Add reply_kind column to reply_training_labels if it doesn't exist
alter table public.reply_training_labels
  add column if not exists reply_kind text
    check (reply_kind in ('positive','neutral','negative','meeting','unsubscribe','bounce','ooo'));

-- Create index for efficient OOO queries
create index if not exists idx_reply_training_labels_kind on public.reply_training_labels(reply_kind) 
  where reply_kind = 'ooo';















