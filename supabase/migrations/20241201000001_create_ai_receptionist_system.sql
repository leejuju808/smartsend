-- SmartSend v2 AI Receptionist System Database Schema
-- This migration adds all the necessary tables for the AI receptionist features

-- AI Receptionist Conversations Table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL CHECK (conversation_type IN ('sms', 'call', 'email')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'escalated', 'cancelled')),
  twilio_sid TEXT, -- Twilio conversation/thread SID
  phone_number TEXT,
  industry TEXT, -- HVAC, med_spa, dental, law, real_estate, etc.
  ai_script_id UUID REFERENCES public.ai_scripts(id),
  meeting_booked BOOLEAN DEFAULT FALSE,
  meeting_datetime TIMESTAMPTZ,
  meeting_notes TEXT,
  crm_synced BOOLEAN DEFAULT FALSE,
  crm_contact_id TEXT, -- External CRM contact ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Scripts Table (Industry-specific conversation scripts)
CREATE TABLE IF NOT EXISTS public.ai_scripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  industry TEXT NOT NULL,
  script_name TEXT NOT NULL,
  script_type TEXT NOT NULL CHECK (script_type IN ('sms', 'call', 'email')),
  script_content JSONB NOT NULL, -- Contains the conversation flow, questions, responses
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Conversation Messages Table
CREATE TABLE IF NOT EXISTS public.ai_conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('inbound', 'outbound', 'ai_generated')),
  content TEXT NOT NULL,
  twilio_message_sid TEXT, -- For SMS messages
  twilio_call_sid TEXT, -- For call transcripts
  metadata JSONB, -- Additional message metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRM Integrations Table
CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_type TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'gohighlevel', 'pipedrive', 'salesforce')),
  crm_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_url TEXT,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Twilio Phone Numbers Table
CREATE TABLE IF NOT EXISTS public.twilio_phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  twilio_sid TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meeting Bookings Table
CREATE TABLE IF NOT EXISTS public.meeting_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_datetime TIMESTAMPTZ NOT NULL,
  meeting_duration INTEGER DEFAULT 30, -- minutes
  meeting_type TEXT, -- consultation, follow_up, etc.
  meeting_notes TEXT,
  calendar_event_id TEXT, -- Google Calendar or other calendar system ID
  crm_opportunity_id TEXT, -- CRM opportunity/lead ID
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts Table (if not exists)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  industry TEXT,
  source TEXT, -- cold_email, inbound_call, inbound_sms, etc.
  crm_contact_id TEXT, -- External CRM contact ID
  tags TEXT[], -- Array of tags
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequences Table (if not exists)
CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequence Steps Table (if not exists)
CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('email', 'sms', 'call')),
  delay_days INTEGER DEFAULT 0,
  subject TEXT, -- For email steps
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads Table (if not exists)
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.sequences(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'unsubscribed')),
  lead_score INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_contact_id ON public.ai_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON public.ai_conversations(status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_type ON public.ai_conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conversation_id ON public.ai_conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_created_at ON public.ai_conversation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_user_id ON public.meeting_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_datetime ON public.meeting_bookings(meeting_datetime);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);

-- Enable Row Level Security
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twilio_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own ai_conversations" ON public.ai_conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ai_scripts" ON public.ai_scripts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ai_conversation_messages" ON public.ai_conversation_messages
  FOR ALL USING (auth.uid() = (SELECT user_id FROM public.ai_conversations WHERE id = conversation_id));

CREATE POLICY "Users can view own crm_integrations" ON public.crm_integrations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own twilio_phone_numbers" ON public.twilio_phone_numbers
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own meeting_bookings" ON public.meeting_bookings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own contacts" ON public.contacts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sequences" ON public.sequences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sequence_steps" ON public.sequence_steps
  FOR ALL USING (auth.uid() = (SELECT user_id FROM public.sequences WHERE id = sequence_id));

CREATE POLICY "Users can view own leads" ON public.leads
  FOR ALL USING (auth.uid() = user_id);

-- Insert default AI scripts for different industries
INSERT INTO public.ai_scripts (user_id, industry, script_name, script_type, script_content) VALUES
-- HVAC Script
('00000000-0000-0000-0000-000000000000', 'hvac', 'HVAC SMS Script', 'sms', '{
  "greeting": "Hi! Thanks for reaching out about your HVAC needs. I''m here to help you with any heating or cooling issues.",
  "qualifying_questions": [
    "What type of HVAC service do you need?",
    "Is this an emergency or can it wait a few days?",
    "What is your preferred time for a service call?"
  ],
  "booking_flow": {
    "trigger_phrases": ["schedule", "appointment", "service call", "estimate", "quote"],
    "response": "I''d be happy to schedule a service call for you. What day and time works best?",
    "confirmation": "Perfect! I''ve scheduled your HVAC service call for [DATE] at [TIME]. A technician will call 30 minutes before arrival."
  },
  "fallback": "I understand you have HVAC needs. Let me connect you with our scheduling team. They''ll call you within 15 minutes."
}'),

-- Med Spa Script
('00000000-0000-0000-0000-000000000000', 'med_spa', 'Med Spa SMS Script', 'sms', '{
  "greeting": "Hello! Thank you for your interest in our med spa services. I''m here to help you look and feel your best.",
  "qualifying_questions": [
    "What type of treatment are you interested in?",
    "Have you had this treatment before?",
    "What is your skin concern or goal?"
  ],
  "booking_flow": {
    "trigger_phrases": ["book", "appointment", "consultation", "treatment", "schedule"],
    "response": "I''d love to schedule a consultation for you. What service are you most interested in?",
    "confirmation": "Excellent! I''ve booked your consultation for [DATE] at [TIME]. You''ll receive a confirmation text with preparation instructions."
  },
  "fallback": "I''d be happy to help you with our med spa services. Let me have our specialist call you to discuss your options."
}'),

-- Dental Script
('00000000-0000-0000-0000-000000000000', 'dental', 'Dental SMS Script', 'sms', '{
  "greeting": "Hi! Thanks for contacting our dental office. I''m here to help you with your dental care needs.",
  "qualifying_questions": [
    "What type of dental service do you need?",
    "Are you experiencing any pain or discomfort?",
    "When was your last dental visit?"
  ],
  "booking_flow": {
    "trigger_phrases": ["appointment", "checkup", "cleaning", "emergency", "pain"],
    "response": "I can help you schedule a dental appointment. What type of service do you need?",
    "confirmation": "Great! I''ve scheduled your dental appointment for [DATE] at [TIME]. Please arrive 15 minutes early for paperwork."
  },
  "fallback": "I understand you need dental care. Let me have our scheduling coordinator call you right away to get you in as soon as possible."
}'),

-- Law Firm Script
('00000000-0000-0000-0000-000000000000', 'law', 'Law Firm SMS Script', 'sms', '{
  "greeting": "Hello! Thank you for reaching out to our law firm. I''m here to help you with your legal needs.",
  "qualifying_questions": [
    "What type of legal matter do you need help with?",
    "Is this urgent or can it wait a few days?",
    "Have you consulted with an attorney before about this matter?"
  ],
  "booking_flow": {
    "trigger_phrases": ["consultation", "meeting", "appointment", "case", "legal advice"],
    "response": "I''d be happy to schedule a consultation with one of our attorneys. What type of legal matter is this regarding?",
    "confirmation": "Perfect! I''ve scheduled your consultation for [DATE] at [TIME]. You''ll receive a confirmation email with case preparation instructions."
  },
  "fallback": "I understand you need legal assistance. Let me have one of our attorneys call you within the hour to discuss your case."
}'),

-- Real Estate Script
('00000000-0000-0000-0000-000000000000', 'real_estate', 'Real Estate SMS Script', 'sms', '{
  "greeting": "Hi! Thanks for your interest in real estate services. I''m here to help you with buying, selling, or investing.",
  "qualifying_questions": [
    "Are you looking to buy, sell, or invest in real estate?",
    "What type of property are you interested in?",
    "What is your timeline for this transaction?"
  ],
  "booking_flow": {
    "trigger_phrases": ["showing", "appointment", "meeting", "property", "market analysis"],
    "response": "I''d love to schedule a meeting to discuss your real estate goals. What type of property are you interested in?",
    "confirmation": "Excellent! I''ve scheduled your real estate consultation for [DATE] at [TIME]. I''ll send you some properties to review beforehand."
  },
  "fallback": "I''d be happy to help you with your real estate needs. Let me have our team call you to discuss your specific requirements."
}');

-- Update the users table to include new subscription tiers
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'core', 'pro', 'scale', 'elite'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ai_receptionist_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS crm_sync_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT;