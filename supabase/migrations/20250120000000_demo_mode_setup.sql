-- Demo Mode Setup Migration
-- Creates a demo organization with sample data for public demo

-- 1. Create demo organization (if not exists)
INSERT INTO organizations (id, name, owner_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Org', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. Create demo organization member
-- Note: Since demo-user is not a real auth user, we use organization_members if available
-- This allows demo mode to work without requiring a real auth.users entry
INSERT INTO organization_members (org_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo-user', 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 3. Create demo profile entry (if profiles table uses id = user_id pattern)
-- Note: This will fail gracefully if demo-user doesn't exist in auth.users
-- Demo mode will work via organization_members bypass
INSERT INTO profiles (id, email)
VALUES ('demo-user', 'demo@smartsendhq.com')
ON CONFLICT (id) DO NOTHING;

-- 4. Create demo campaign
INSERT INTO campaigns (id, name, org_id)
VALUES ('demo-camp-1', 'AI Cold Outreach Test', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 5. Create demo leads
INSERT INTO leads (id, name, email, company, org_id)
VALUES
  ('demo-lead-1', 'Jane Doe', 'jane@example.com', 'Acme Inc', '00000000-0000-0000-0000-000000000001'),
  ('demo-lead-2', 'John Smith', 'john@example.com', 'TechCo', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 6. Create demo threads
INSERT INTO threads (id, org_id, campaign_id, lead_email, subject, status, last_message_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'demo-camp-1', 'jane@example.com', 'Re: Quick Question About AI Outreach', 'open', now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'demo-camp-1', 'john@example.com', 'Following Up on SmartSend', 'replied', now())
ON CONFLICT DO NOTHING;

