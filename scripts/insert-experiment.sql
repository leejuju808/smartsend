-- Insert the upgrade_banner experiment
-- Run this in your Supabase SQL editor

insert into public.experiments (name, variants) values
('upgrade_banner', '[{"key":"A","weight":0.5},{"key":"B","weight":0.5}]');

-- Verify the experiment was created
select * from public.experiments where name = 'upgrade_banner'; 