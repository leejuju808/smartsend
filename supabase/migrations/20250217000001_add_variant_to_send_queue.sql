-- Add template_variant_id to send_queue
alter table public.send_queue add column if not exists template_variant_id uuid references template_variants(id);

-- Add index for performance
create index if not exists idx_send_queue_variant_id on public.send_queue(template_variant_id) where template_variant_id is not null;