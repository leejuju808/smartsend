-- BLOCK 272000 — SmartSend Operating System Sprint
-- Replace guessing with levers: Volume / Area / Capacity.
--
-- We expose exactly three controls at the workspace level:
-- - Volume   -> workspaces.demand_throttle (already exists; low/normal/high)
-- - Area     -> workspaces.area_zip_enabled (this migration)
-- - Capacity -> workspaces.crew_capacity_jobs (already exists; int)
--
-- Area (Zip ON/OFF) is intentionally boolean:
-- - OFF: outreach is constrained to leads that are inside the defined service area (best-effort)
-- - ON: outreach can include leads outside the service area (expanded area)

alter table public.workspaces
  add column if not exists area_zip_enabled boolean not null default false;

comment on column public.workspaces.area_zip_enabled is
  'Block 272000: Area lever (Zip ON/OFF). OFF = constrain outreach to in-service-area leads; ON = expanded area.';




