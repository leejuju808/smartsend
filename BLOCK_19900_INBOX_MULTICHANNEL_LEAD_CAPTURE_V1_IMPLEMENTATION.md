# Block 19900 — Inbox Multi-Channel Lead Capture v1 Implementation

## Overview

This block implements a comprehensive multi-channel lead capture system that brings ALL new leads straight into the SmartSend Inbox from every source a roofing company gets jobs from. The Inbox becomes "Every lead your roofing company gets — in one place."

## What Was Built

### ✅ PART 1 — SmartSend Web Form → Inbox Integration

**Database Schema:**
- `lead_capture_forms` - Hosted lead capture forms for each workspace
- `lead_form_submissions` - Form submissions that create inbox threads

**API Endpoint:**
- `POST /api/lead-capture/form-submit` - Handles form submissions

**Features:**
- Auto-creates inbox thread
- AI reads the form
- Lead scored via Smart Intake Parser
- Tasks auto-created
- AI draft reply ready
- Owner notified

**Form URL Pattern:**
- `{workspace-slug}.smartsendhq.com/lead` (or custom domain)

### ✅ PART 2 — Landing Page Builder (Lead Capture Only)

**Database Schema:**
- `landing_pages` - Landing page templates

**API Endpoint:**
- `GET /api/lead-capture/landing-page/[slug]` - Returns landing page HTML

**Features:**
- Simple, clean landing page template
- Auto-generated sections:
  - Headline ("Free Roof Estimate")
  - Form
  - Testimonials (editable)
  - Company logo
  - Photo of roofers
  - Call Now button

### ✅ PART 3 — Facebook Lead Ads → Inbox

**Database Schema:**
- `facebook_lead_ads` - Facebook Lead Ads integration
- `facebook_webhook_configs` - Webhook configuration

**API Endpoint:**
- `GET/POST /api/lead-capture/facebook-webhook` - Facebook webhook handler

**Features:**
- Instantly enters Inbox when FB generates a lead
- AI scores + summarizes
- Tasks created
- Notifications fire
- AI draft reply ready
- Follow-up sequence begins

### ✅ PART 4 — Missed Call → Inbox Conversion

**Database Schema:**
- `missed_calls` - Missed call records

**API Endpoint:**
- `POST /api/lead-capture/missed-call` - Converts missed calls to inbox threads

**Features:**
- Creates new Inbox thread: "Missed Call: (XXX) XXX-XXXX"
- Shows timestamp, caller ID, call duration
- Auto-sends SMS (if owner enabled): "Sorry we missed your call — want me to help you schedule a roof inspection?"

### ✅ PART 5 — Voicemail → Inbox

**Database Schema:**
- `voicemails` - Voicemail records with transcription

**API Endpoint:**
- `POST /api/lead-capture/voicemail` - Transcribes voicemail and creates inbox thread

**Features:**
- Audio stored
- Transcribed (OpenAI Whisper)
- Summarized by AI
- Lead score applied
- Urgency detected
- Thread displays: "Voicemail (0:23)" with transcript and urgency badge

### ✅ PART 6 — Google Local Services Leads → Inbox (Manual v1)

**Database Schema:**
- `google_local_services_leads` - GLS leads via email forwarding

**API Endpoint:**
- `POST /api/lead-capture/google-local-services` - Handles GLS email forwarding

**Features:**
- Email forwarding → Inbox
- Intake parser extracts name, phone, job type
- Creates new thread
- AI summarizes

### ✅ PART 7 — "Smart Intake Parser" (Intelligence)

**Database Schema:**
- `smart_intake_analysis` - AI analysis results

**API Endpoint:**
- `POST /api/lead-capture/smart-intake` - AI-powered lead analysis

**Features:**
- AI detects:
  - leak
  - storm damage
  - insurance claim
  - replacement request
  - gutter issue
  - inspection needed
  - urgency level
  - expected job value
  - missing information
- Adds "Missing Info:" flags (address, photos, timeline)
- Suggests "Next Step:" actions (call, send insurance instructions, schedule inspection, send estimator)

### ✅ PART 8 — Lead Source Tagging

**Database Schema:**
- Extended `contacts` table with `lead_source` and `source_meta` columns

**Lead Sources:**
- `web_form`
- `landing_page`
- `facebook_lead`
- `missed_call`
- `voicemail`
- `google_local_services`
- `sms`
- `email`
- `referral`
- `unknown`

**Features:**
- Every new lead gets tagged with source
- Visible in thread list and CRM
- Enables source-based analytics

### ✅ PART 9 — Intake Performance Dashboard (Mini v1)

**Database Views:**
- `v_intake_leads_by_source` - Leads by source
- `v_form_submission_stats` - Form submission stats
- `v_missed_call_recovery` - Missed call recovery stats
- `v_facebook_lead_stats` - Facebook Lead Ads stats
- `v_response_time_by_source` - Response time by source

**API Endpoint:**
- `GET /api/lead-capture/intake-dashboard` - Returns intake performance metrics

**Metrics:**
- Leads by source
- Conversion rate by source
- Avg job value by source
- Response time by source
- Missed call recovery rate
- Form submission volume
- FB lead response time

## Database Migration

**File:** `supabase/migrations/20250130000002_block19900_inbox_multichannel_lead_capture_v1.sql`

**Tables Created:**
1. `lead_capture_forms` - Form configurations
2. `lead_form_submissions` - Form submissions
3. `landing_pages` - Landing page templates
4. `missed_calls` - Missed call records
5. `voicemails` - Voicemail records
6. `facebook_lead_ads` - Facebook Lead Ads
7. `facebook_webhook_configs` - Facebook webhook configs
8. `google_local_services_leads` - GLS leads
9. `smart_intake_analysis` - AI analysis results

**Columns Added:**
- `contacts.lead_source` - Lead source tag
- `contacts.source_meta` - Source metadata (JSONB)

**Views Created:**
- `v_intake_leads_by_source`
- `v_form_submission_stats`
- `v_missed_call_recovery`
- `v_facebook_lead_stats`
- `v_response_time_by_source`

**Functions Created:**
- `get_or_create_contact_from_form()` - Helper to get/create contacts

## API Endpoints

### Lead Capture

1. **Form Submission**
   - `POST /api/lead-capture/form-submit`
   - Body: `{ form_slug, workspace_id, submission_data }`

2. **Smart Intake Parser**
   - `POST /api/lead-capture/smart-intake`
   - Body: `{ workspace_id, contact_id, thread_id, source_type, source_id, submission_data }`

3. **Facebook Webhook**
   - `GET /api/lead-capture/facebook-webhook` - Verification
   - `POST /api/lead-capture/facebook-webhook` - Event handler

4. **Missed Call**
   - `POST /api/lead-capture/missed-call`
   - Body: `{ workspace_id, caller_phone, caller_name, call_duration_seconds, metadata }`

5. **Voicemail**
   - `POST /api/lead-capture/voicemail`
   - Body: `{ workspace_id, caller_phone, caller_name, audio_url, duration_seconds, metadata }`

6. **Google Local Services**
   - `POST /api/lead-capture/google-local-services`
   - Body: `{ workspace_id, email_subject, email_body, raw_email_data }`

7. **Landing Page**
   - `GET /api/lead-capture/landing-page/[slug]?workspace_id=...`
   - Returns HTML landing page

8. **Intake Dashboard**
   - `GET /api/lead-capture/intake-dashboard?workspace_id=...&start_date=...&end_date=...`
   - Returns intake performance metrics

## Integration Flow

### Web Form Submission Flow

1. User submits form → `POST /api/lead-capture/form-submit`
2. System gets or creates contact
3. Creates form submission record
4. Creates inbox thread (if enabled)
5. Runs Smart Intake Parser (if enabled)
6. Auto-creates tasks (if enabled)
7. Generates AI draft reply (if enabled)
8. Notifies owner (if enabled)

### Facebook Lead Ads Flow

1. Facebook sends webhook → `POST /api/lead-capture/facebook-webhook`
2. System fetches lead details from Facebook API
3. Gets or creates contact
4. Stores Facebook lead record
5. Creates inbox thread
6. Runs Smart Intake Parser
7. Auto-creates tasks
8. Generates AI draft reply

### Missed Call Flow

1. Call system sends missed call event → `POST /api/lead-capture/missed-call`
2. System finds or creates contact by phone
3. Creates missed call record
4. Creates inbox thread
5. Auto-sends SMS (if enabled)
6. Creates follow-up task

### Voicemail Flow

1. Call system sends voicemail → `POST /api/lead-capture/voicemail`
2. System finds or creates contact by phone
3. Creates voicemail record
4. Transcribes audio (OpenAI Whisper)
5. Analyzes transcript with AI
6. Creates inbox thread with transcript
7. Runs Smart Intake Parser
8. Creates follow-up task

## Smart Intake Parser

The Smart Intake Parser uses AI (OpenAI GPT-4o-mini) to analyze leads and provide:

- **Detected Job Types:** leak, storm_damage, insurance_claim, replacement, gutter_issue, inspection
- **Urgency Level:** low, medium, high, urgent
- **Expected Job Value:** Estimated dollar amount
- **Lead Score:** 0-100 quality score
- **Missing Information:** Flags for address, photos, timeline
- **Suggested Next Steps:** call, send_insurance_instructions, schedule_inspection, send_estimator

## Task Auto-Generation

Tasks are automatically created for new leads based on:
- Lead source
- Job type
- Urgency level
- Missing information

Default tasks:
- "Follow up on new lead" (24 hours)
- "Schedule roof inspection" (if inspection requested, 12 hours)
- "Follow up on missed call" (2 hours)
- "Follow up on voicemail" (2 hours)

## Lead Source Tagging

Every lead is tagged with its source:
- Visible in `contacts.lead_source` column
- Stored in `contacts.source_meta` JSONB column
- Used for analytics and filtering

## Intake Performance Dashboard

The dashboard provides real insights:
- Leads by source (counts)
- Conversion rate by source (%)
- Average job value by source ($)
- Response time by source (seconds)
- Missed call recovery rate (%)
- Form submission volume
- Facebook lead response time

## Security & RLS

All tables have Row Level Security (RLS) enabled:
- Workspace members can only access their workspace data
- Policies check workspace membership via `workspace_members` table

## Environment Variables Required

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key (for Smart Intake Parser and voicemail transcription)
- `NEXT_PUBLIC_APP_URL` - App URL (for internal API calls)

## Next Steps / Future Enhancements

1. **Full Facebook API Integration** - Direct API integration (currently webhook-based)
2. **Full Google Local Services API** - Direct API integration (currently email forwarding)
3. **Instagram DM Integration** - Add Instagram DM as lead source
4. **Yelp/Angi/Thumbtack Integration** - Add more lead sources
5. **Advanced Landing Page Builder** - Drag-and-drop builder
6. **Form Builder UI** - Visual form builder in dashboard
7. **SMS Integration** - Full SMS inbox integration
8. **Call Recording** - Store and transcribe call recordings
9. **Lead Scoring Refinement** - More sophisticated lead scoring algorithm
10. **A/B Testing** - Test different landing pages and forms

## Testing Checklist

- [ ] Web form submission creates inbox thread
- [ ] Smart Intake Parser analyzes leads correctly
- [ ] Tasks are auto-created for new leads
- [ ] Facebook webhook verification works
- [ ] Facebook lead processing works
- [ ] Missed call creates thread and sends SMS
- [ ] Voicemail transcription works
- [ ] Google Local Services email parsing works
- [ ] Landing page renders correctly
- [ ] Intake dashboard returns correct metrics
- [ ] Lead source tagging works
- [ ] RLS policies work correctly

## Files Created

### Database
- `supabase/migrations/20250130000002_block19900_inbox_multichannel_lead_capture_v1.sql`

### API Routes
- `app/api/lead-capture/form-submit/route.ts`
- `app/api/lead-capture/smart-intake/route.ts`
- `app/api/lead-capture/facebook-webhook/route.ts`
- `app/api/lead-capture/missed-call/route.ts`
- `app/api/lead-capture/voicemail/route.ts`
- `app/api/lead-capture/google-local-services/route.ts`
- `app/api/lead-capture/landing-page/[slug]/route.ts`
- `app/api/lead-capture/intake-dashboard/route.ts`

## Summary

Block 19900 successfully implements a comprehensive multi-channel lead capture system that brings all leads into the SmartSend Inbox. Roofers now get:

✅ No lost leads
✅ No missed calls falling through
✅ Faster follow-ups
✅ Better close rates
✅ Real analytics
✅ Organized communication
✅ A single place for everything
✅ More booked estimates
✅ More jobs won

SmartSend becomes **The Lead Capture Hub + Inbox + AI Brain** for the entire roofing business.



















































