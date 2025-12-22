-- Block 21711 — SmartSend Auto-Reply Engine for Warm/Hot Roofing Leads v1
-- Schema Upgrade: Booking Link on Campaigns

-- Add booking_link_url column to campaigns table
-- Roofers can plug in their calendar link (Calendly, PhoneBurner, whatever)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS booking_link_url text;

COMMENT ON COLUMN public.campaigns.booking_link_url IS 'Calendar/booking link URL for warm/hot lead auto-replies (e.g. Calendly, PhoneBurner)';











































