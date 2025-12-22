-- Template Variants & A/B Experiment System  
-- This migration adds variant_id tracking for the new user-library based template variants system
-- This works alongside the existing template_versions system that uses variant_key

-- Note: We're adding variant_id columns to queue/logs for the new system
-- while keeping variant_key + template_version_id for existing system compatibility

-- Wire variant_id through queue + logs for attribution
alter table public.send_queue add column if not exists variant_id uuid references public.template_variants(id);
alter table public.send_logs  add column if not exists variant_id uuid references public.template_variants(id);

-- Indexes for performance  
create index if not exists idx_send_queue_variant on public.send_queue(variant_id) where variant_id is not null;
create index if not exists idx_send_logs_variant on public.send_logs(variant_id) where variant_id is not null;

