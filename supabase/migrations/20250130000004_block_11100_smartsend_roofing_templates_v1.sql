-- =========================================================
-- Block 11100 — SmartSend Roofing Templates Library v1
-- (The Pre-Built Messages That Make Roofers Say "Damn This Is Easy")
-- =========================================================

-- This migration adds the 4 core roofing templates + follow-up templates
-- These templates are optimized for maximum replies and zero thinking required

-- ============================================================================
-- 1. INSERT THE 4 CORE ROOFING TEMPLATES (v1)
-- ============================================================================

-- Template 1 — Homeowner Inspection Outreach (Cold Campaign)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Homeowner Inspection Outreach',
  'Maximum replies. Ideal for first campaign. Good for neighborhoods, city-wide lists, and fresh homeowners.',
  '[
    {
      "stepNumber": 1,
      "subject": "Quick question about your roof",
      "body": "Hey {{first_name}},\n\nWe''re helping homeowners in {{city}} with repairs and inspections before weather changes.\n\nDo you need anyone to take a look at your roof?",
      "delayDays": 0
    }
  ]'::jsonb,
  'homeowner_outreach',
  ARRAY['cold', 'inspection', 'first_campaign', 'neighborhoods'],
  true
);

-- Template 2 — Roof Leak / Repair Push (Urgency Campaign)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Roof Leak / Repair Push',
  'Urgent repair jobs ($300–$4,000). Works great after storms. High conversion.',
  '[
    {
      "stepNumber": 1,
      "subject": "Do you need roof work done?",
      "body": "Just checking in — any leaks, missing shingles, or spots you want us to look at?\n\nWe''ve got a slot open this week if you need help.",
      "delayDays": 0
    }
  ]'::jsonb,
  'leak_repair',
  ARRAY['urgent', 'repair', 'leak', 'storm', 'high_conversion'],
  true
);

-- Template 3 — Old Quote Reactivation (Money Printer)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Old Quote Reactivation',
  'Revive old quotes & dead leads. Roofers love this — brings back forgotten money.',
  '[
    {
      "stepNumber": 1,
      "subject": "Before I close this out…",
      "body": "Hey {{first_name}},\n\nI didn''t want to mark your estimate as closed before checking in.\n\nDo you still need that roof work done?",
      "delayDays": 0
    }
  ]'::jsonb,
  'quote_reactivation',
  ARRAY['old_quotes', 'dead_leads', 'reactivation', 'money_printer'],
  true
);

-- Template 4 — Seasonal Roofing Push (High Ticket)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Seasonal Roofing Push',
  'Big-ticket replacements ($8k–$25k). Good in fall + spring. Pushes high-value homeowners.',
  '[
    {
      "stepNumber": 1,
      "subject": "Quick prep before {{season}} hits",
      "body": "If you want the roof in shape before {{season}} arrives, we can stop by for a quick inspection.\n\nWant me to put you on the schedule?",
      "delayDays": 0
    }
  ]'::jsonb,
  'seasonal_push',
  ARRAY['seasonal', 'high_ticket', 'replacement', 'fall', 'spring'],
  true
);

-- ============================================================================
-- 2. INSERT FOLLOW-UP TEMPLATES (Auto-Send)
-- These power the SmartSend Auto-Follow-Up Brain (Block 10600)
-- ============================================================================

-- Follow-Up 1 (No Reply After 2 Days)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Follow-Up: No Reply After 2 Days',
  'Auto-send follow-up when no reply after 2 days. Powers SmartSend Auto-Follow-Up Brain.',
  '[
    {
      "stepNumber": 1,
      "subject": "Just checking in",
      "body": "Just checking in — still want someone to take a quick look at the roof?",
      "delayDays": 2
    }
  ]'::jsonb,
  'followup',
  ARRAY['followup', 'auto_send', 'no_reply', '2_days'],
  true
);

-- Follow-Up 2 (No Reply After 4 Days)
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Follow-Up: No Reply After 4 Days',
  'Auto-send follow-up when no reply after 4 days. Powers SmartSend Auto-Follow-Up Brain.',
  '[
    {
      "stepNumber": 1,
      "subject": "Before I close this out",
      "body": "Before I close this out — want me to send someone to check the roof?\n\nJust reply ''yes''.",
      "delayDays": 4
    }
  ]'::jsonb,
  'followup',
  ARRAY['followup', 'auto_send', 'no_reply', '4_days'],
  true
);

-- Warm Lead Follow-Up
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Follow-Up: Warm Lead',
  'Auto-send when lead shows interest but hasn''t booked. Powers SmartSend Auto-Follow-Up Brain.',
  '[
    {
      "stepNumber": 1,
      "subject": "No problem",
      "body": "No problem — want a quick estimate or just an inspection first?",
      "delayDays": 1
    }
  ]'::jsonb,
  'followup',
  ARRAY['followup', 'auto_send', 'warm_lead', 'interested'],
  true
);

-- Hot Lead Confirmation
INSERT INTO public.templates_campaigns (title, description, steps, category, tags, is_global)
VALUES (
  'Follow-Up: Hot Lead Confirmation',
  'Auto-send when lead is ready to book. Powers SmartSend Auto-Follow-Up Brain.',
  '[
    {
      "stepNumber": 1,
      "subject": "We can come take a look",
      "body": "We can come take a look. What day works best?",
      "delayDays": 0
    }
  ]'::jsonb,
  'followup',
  ARRAY['followup', 'auto_send', 'hot_lead', 'ready_to_book'],
  true
);

-- ============================================================================
-- 3. COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.templates_campaigns IS 'Block 11100 — SmartSend Roofing Templates Library v1. Pre-built messages that make roofers say "Damn This Is Easy".';

-- Personalization Engine Rules (documented in code comments):
-- Rule 1: Mention their city or area — "helping homeowners in {{city}}"
-- Rule 2: Keep the tone blue-collar + direct — Roofers do NOT talk like marketers
-- Rule 3: Never more than 3 sentences — Short emails get replies
-- Rule 4: Use natural language, not AI-sounding phrases — No: "I was reaching out regarding…" Yes: "Quick question."
-- Rule 5: ALWAYS single call-to-action — One simple question = more replies























































