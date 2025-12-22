# Block 20560 — SmartSend Insurance + Proposal Email Sender v1

**Implementation Summary**

This is the block that sends money out the door for roofing companies. Roofers fail because they don't send proposals fast enough. SmartSend fixes that with ONE BUTTON.

## ✅ Implementation Complete

### 1. Database Schema (`supabase/migrations/20250131000007_block20560_proposal_email_sender_v1.sql`)

#### `proposal_email_sends` Table
- Tracks all proposal emails sent to homeowners
- Fields:
  - `proposal_id` - Links to proposals table
  - `thread_id` - Links to inbox_threads
  - `to_email`, `to_name` - Recipient info
  - `subject`, `html_body`, `text_body` - Email content
  - `status` - queued, sending, sent, failed, cancelled
  - `trigger_source` - manual_button, homeowner_request_detected, claim_approval_auto, hot_lead_auto
  - `provider_message_id` - Email provider tracking
  - `sent_at`, `opened_at`, `clicked_at` - Tracking timestamps

#### Functions Created:
1. **`generate_proposal_email()`** - Generates email data structure for AI personalization
2. **`should_auto_send_proposal()`** - Determines if proposal should be auto-sent based on triggers
3. **`detect_proposal_request_in_thread()`** - Detects homeowner requests for proposals/quotes

#### Triggers Created:
1. **`trigger_timeline_on_proposal_sent()`** - Auto-creates timeline event (QUOTE_SENT) when proposal email is sent
2. **`update_lead_score_on_proposal_sent()`** - Updates lead score (+10) and hot lead tier when proposal is sent

### 2. AI Email Generator (`src/lib/ai/proposalEmailGenerator.ts`)

**Features:**
- AI-powered subject line selection (4 options, chooses best based on context)
- Personalized email body with:
  - Homeowner-friendly language
  - Insurance-aware messaging (RCV, ACV, deductible, depreciation)
  - Local references and weather mentions
  - Clear pricing breakdown
  - Scope of work
  - Warranty information
  - Timeline details
  - Clear next steps
  - Professional contractor signature

**Input:**
- Proposal data (price, scope, warranty, timeline)
- Insurance data (carrier, deductible, RCV, ACV, depreciation)
- Contractor info (company name, phone, email, signature)
- Contact info (name, email, city, state)

**Output:**
- Subject line
- HTML email body
- Plain text email body

**Fallback:** If AI fails, generates a basic but professional email template.

### 3. API Endpoints

#### `GET/POST /api/inbox/proposals/[id]/email/generate`
- Generates proposal email preview (does not send)
- Returns email structure with subject, HTML, and text body
- Allows contractor to review before sending

#### `POST /api/inbox/proposals/[id]/email/send`
- Sends proposal email to homeowner
- Creates `proposal_email_sends` record
- Sends via email provider (Resend, Gmail, SMTP)
- Updates proposal status to 'sent'
- Creates timeline event (QUOTE_SENT)
- Updates lead score (+10)
- Creates outbound message in inbox_messages

#### `GET/POST /api/inbox/proposals/auto-send`
- Checks for proposals that should be auto-sent
- Sends proposals automatically based on triggers
- Can be called by cron job or webhook
- GET: Dry run (check which proposals would be sent)
- POST: Actually send eligible proposals

### 4. Trigger Logic

Proposal sending can be triggered by:

1. **Manual Button** - Contractor clicks "Send Proposal" in UI
2. **Homeowner Request Detected** - SmartSend detects homeowner asked: "Can you send me the quote?"
3. **Claim Approval Auto** - SmartSend detects claim approval and contractor hasn't sent anything in 24 hrs
4. **Hot Lead Auto** - Hot Lead Engine (20430) classifies lead as HOT with no proposal sent

### 5. Integration Points

#### Timeline Events (Block 20460)
- Automatically logs `QUOTE_SENT` event when proposal email is sent
- Includes proposal_id, email_send_id, subject, trigger_source

#### Hot Lead Engine (Block 20430)
- Updates lead score: +10 points when proposal is sent
- Updates hot_lead_score: +10 points
- Updates next_action: "Await homeowner reply"
- May move tier from WARM → HOT if score >= 80

#### Insurance Brain (Block 20360)
- Uses insurance data (carrier, deductible, RCV, ACV, depreciation) in email personalization
- References claim approval status in email messaging

#### Proposal Builder (Block 20520)
- Pulls proposal data (price, scope, warranty, timeline) from proposals table
- Uses proposal_data JSONB structure

### 6. Email Personalization Features

**AI-Powered:**
- Subject line selection (4 options, AI chooses best)
- Tone matching homeowner emails
- Local references (city, state)
- Weather mentions (based on city)
- Insurance-aware messaging
- Supplement suggestions
- Clear next steps

**Example Email Structure:**
```
Subject: Your Roof Replacement Proposal (State Farm Approved)

Hi Sarah,

Thanks again for reaching out about your roof. Based on your State Farm approved claim and the roof measurements, I've put together your full replacement proposal below.

Total Project Price: $22,680
Insurance RCV: $28,500
Deductible: $1,500
Recoverable Depreciation: Yes

Scope of Work:
• Remove old roofing
• Install new underlayment
• Install architectural shingles
• Ridge vent installation
• Ice & water shield
• All code-required components

The proposal includes materials, labor, cleanup, disposal, and a 10-year workmanship warranty.

We can deliver materials within 1–2 business days and complete the full installation in one day.

Since your approval includes recoverable depreciation, we'll help you recover that final check once the install is finished.

If everything looks good, you can reply to this email or give us a quick call to get your installation scheduled.

Looking forward to helping you get everything completed.

— Titan Roofing
(509) 555-1212
info@titanroofing.com
```

### 7. Usage Examples

#### Manual Send (Contractor clicks button):
```typescript
POST /api/inbox/proposals/{proposal_id}/email/send
{
  "trigger_source": "manual_button"
}
```

#### Auto-Send Check (Cron job):
```typescript
POST /api/inbox/proposals/auto-send
{
  "workspace_id": "optional-filter"
}
```

#### Generate Preview:
```typescript
GET /api/inbox/proposals/{proposal_id}/email/generate
```

### 8. Database Queries

#### Check if proposal should be auto-sent:
```sql
SELECT should_auto_send_proposal(thread_id);
```

#### Detect homeowner request:
```sql
SELECT detect_proposal_request_in_thread(thread_id);
```

#### Get proposal email data:
```sql
SELECT generate_proposal_email(proposal_id, contractor_settings);
```

### 9. Security & Permissions

- Row Level Security (RLS) enabled on `proposal_email_sends` table
- Users can only view/create/update emails in their workspace
- Service role has full access for background jobs

### 10. Error Handling

- AI failures fall back to basic email template
- Email send failures are logged in `proposal_email_sends.status = 'failed'`
- Error messages stored in `error_message` field
- Retry logic can be added via status tracking

## 🎯 How This Helps Roofing Companies

**Problems Solved:**
- ✅ Roofers reply too slow → Instant sending
- ✅ They forget to send proposals → Auto-detection and reminders
- ✅ Their emails sound sloppy → AI-generated professional emails
- ✅ Proposals don't match insurance details → Insurance-aware messaging
- ✅ They don't personalize messages → AI personalization layer
- ✅ They waste time writing the same email → One-click send

**Results:**
- Sends instantly
- Perfect, homeowner-friendly email
- Personalized
- Insurance-aware
- Clear pricing
- Clear timeline
- Clear next steps
- Automatically logged in timeline
- Boosts lead score
- Increases close rate

**This block = Real $$$ for contractors.**

It makes SmartSend feel like a sales assistant that never sleeps.
















































