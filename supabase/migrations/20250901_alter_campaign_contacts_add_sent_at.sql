alter table campaign_contacts
add column if not exists sent_at timestamp with time zone;

