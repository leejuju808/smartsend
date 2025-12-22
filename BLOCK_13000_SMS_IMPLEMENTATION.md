# Block 13000 — SMS Follow-Up Engine v1 Implementation

## Overview

This document describes the implementation of SMS functionality for SmartSend, enabling two-way texting, automated SMS sequences, and unified inbox support.

## Components Implemented

### 1. Database Schema (`supabase/migrations/20250130000002_block13000_sms_followup_engine_v1.sql`)

**Organizations Table Extensions:**
- `sms_number` - Dedicated Twilio number per organization
- `sms_provider` - Provider type (twilio, nexmo, telnyx)
- `sms_credentials` - JSONB storage for provider credentials
- `sms_sent_this_period` - Counter for current billing period
- `sms_period_start` - Start of current billing period

**Messages Table Extensions:**
- `channel` - 'email' or 'sms'
- `phone` - Phone number for SMS messages

**Reply Threads Table Extensions:**
- `channel` - 'email' or 'sms' to distinguish thread types

**Contacts Table Extensions:**
- `sms_opt_out` - Boolean flag for SMS opt-out
- `phone` - Phone number field

**Campaign Steps:**
- Already supports SMS via Block 459 migration
- `step_type` can be 'sms'
- `sms_body` - SMS message content
- `sms_phone_field` - Field mapping for phone number

**New Tables:**
- `sms_usage` - Tracking SMS usage per organization per period
- `sms_suppressions` - Opt-out and suppression list

**Helper Functions:**
- `is_sms_suppressed()` - Check if phone is suppressed
- `get_sms_plan_limit()` - Get SMS limit based on plan
- `can_send_sms()` - Check if organization can send SMS
- `increment_sms_usage()` - Track SMS usage
- `handle_sms_opt_out()` - Process opt-out requests

### 2. SMS Provider Library (`src/lib/providers/sms.ts`)

**Features:**
- Twilio integration (primary)
- Phone number normalization (E.164 format)
- Message validation
- Time-based restrictions (8am-8pm local time)
- Opt-out keyword detection
- Rate limiting helpers

**Functions:**
- `sendSMSViaTwilio()` - Send SMS via Twilio API
- `sendSMS()` - Provider abstraction layer
- `normalizePhoneNumber()` - Convert to E.164 format
- `validateSMSMessage()` - Validate message content
- `canSendSMSAtTime()` - Check time restrictions
- `detectOptOutKeywords()` - Detect STOP keywords
- `getSMSRateLimits()` - Get rate limits by plan

### 3. API Endpoints

#### `/api/sms/send` (`app/api/sms/send/route.ts`)

**Purpose:** Send outbound SMS messages

**Request Body:**
```json
{
  "to": "+1xxxxxxxxxx",
  "message": "string",
  "contactId": "uuid",
  "campaignId": "uuid",
  "stepId": "uuid",
  "organizationId": "uuid"
}
```

**Features:**
- Validates phone number format
- Checks SMS plan limits
- Checks opt-out/suppression list
- Enforces time-based restrictions (8am-8pm)
- Sends via Twilio
- Tracks usage
- Creates message and thread records

#### `/api/sms/inbound` (`app/api/sms/inbound/route.ts`)

**Purpose:** Handle inbound SMS webhook from Twilio

**Features:**
- Receives Twilio webhook (form data)
- Maps incoming number to organization
- Detects opt-out keywords (STOP, STOPALL, etc.)
- Creates/finds contact
- Creates/finds SMS thread
- Stores inbound message
- Queues intent classification job

**Response:** TwiML XML (empty for V1, no auto-reply)

### 4. SMS Intent Classification

#### Library (`lib/ai/sms-intent.ts`)
- Extends email reply intent classifier
- Adds opt-out detection
- Uses OpenAI GPT-4o-mini for classification

#### Edge Function (`supabase/functions/sms-intent-classify/index.ts`)
- Supabase Edge Function for async classification
- Processes queued SMS intent classification jobs
- Updates message and thread with AI labels

#### Job Runner Integration (`supabase/functions/job-runner/index.ts`)
- Added `sms_intent_classify` job type
- Calls SMS intent classification function

### 5. Plan Limits Enforcement

**Limits by Plan:**
- Starter: 200 SMS/month
- Growth: 500 SMS/month
- Domination: 2,000 SMS/month

**Enforcement:**
- Checked before sending via `can_send_sms()` function
- Usage tracked via `increment_sms_usage()` function
- Period resets monthly automatically

### 6. Safety Controls

**Time Restrictions:**
- No sending before 8am local time
- No sending after 8pm local time
- Enforced in `canSendSMSAtTime()` function

**Rate Limiting:**
- Per-minute limits (5/10/20 based on plan)
- Per-hour limits (50/100/200 based on plan)
- Per-day limits (200/500/2000 based on plan)

**Opt-Out Handling:**
- Automatic detection of STOP keywords
- Updates `sms_suppressions` table
- Updates contact `sms_opt_out` flag
- Blocks future SMS sends

## Usage Examples

### Sending SMS via API

```typescript
const response = await fetch('/api/sms/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+15551234567',
    message: 'Hey {first_name}, just checking if you\'re still dealing with roof damage. Want me to take a look?',
    contactId: 'contact-uuid',
    campaignId: 'campaign-uuid',
    stepId: 'step-uuid',
  }),
});
```

### Setting Up Twilio Webhook

1. In Twilio Console, configure webhook URL:
   ```
   https://yourdomain.com/api/sms/inbound
   ```
2. Method: POST
3. This handles all inbound SMS automatically

### Creating SMS Campaign Step

```sql
INSERT INTO campaign_steps (
  campaign_id,
  step_no,
  step_type,
  sms_body,
  delay_days
) VALUES (
  'campaign-uuid',
  2,
  'sms',
  'Hey {first_name}, just checking if you''re still dealing with roof damage.',
  1
);
```

## Testing

### Test SMS Sending

1. Configure organization with Twilio credentials:
```sql
UPDATE organizations
SET 
  sms_number = '+15551234567',
  sms_provider = 'twilio',
  sms_credentials = '{"accountSid": "...", "authToken": "...", "phoneNumber": "+15551234567"}'::jsonb
WHERE id = 'org-uuid';
```

2. Send test SMS:
```bash
curl -X POST http://localhost:3000/api/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15559876543",
    "message": "Test SMS from SmartSend",
    "organizationId": "org-uuid"
  }'
```

### Test Inbound SMS

1. Send SMS to your Twilio number
2. Webhook should receive and process automatically
3. Check `messages` table for inbound message
4. Check `reply_threads` for thread creation

## Next Steps (V2 Features)

- [ ] SMS template library
- [ ] SMS snippet library
- [ ] "Test SMS to my phone" button in campaign builder
- [ ] SMS analytics dashboard
- [ ] SMS delivery status tracking
- [ ] SMS reply auto-responses
- [ ] Multi-provider support (Nexmo, Telnyx)
- [ ] SMS personalization variables
- [ ] SMS A/B testing

## Acceptance Criteria Status

✅ Organizations have an SMS number  
✅ SMS steps can be added to campaigns  
✅ SMS sends correctly  
✅ Replies arrive in unified inbox  
✅ Threads show SMS channel clearly  
✅ AI intent classifier works for SMS  
✅ STOP → opt-out handled  
✅ SMS usage tracked by plan  
✅ Limits enforced  
✅ Rate limiting protects deliverability  
✅ RLS secure  
⏳ UI allows replying via SMS (pending UI work)  
⏳ Testing tool can text the user's phone (pending UI work)  

## Notes

- V1 focuses on core functionality
- UI updates for inbox and campaign builder are pending
- Twilio is the primary provider; other providers can be added later
- SMS personalization uses same variable system as email
- All SMS messages are stored in unified `messages` table with `channel='sms'`




























































