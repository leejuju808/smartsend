# Block 20590 — SmartSend Adjuster Communication Engine v1
## Implementation Summary

This document summarizes the implementation of Block 20590 - SmartSend Adjuster Communication Engine v1, which enables SmartSend to automatically generate and send professional emails to insurance adjusters on behalf of roofers.

## ✅ Implementation Complete

### 1. Database Schema (`supabase/migrations/20250131000007_block20590_adjuster_communication_engine_v1.sql`)

#### Tables Created:

1. **`adjuster_emails`** - Tracks all adjuster communication emails
   - Links to thread, contact, and lead
   - Stores adjuster and homeowner information
   - Email types: supplement_request, approval_nudge, pricing_dispute, missing_items_dispute, documentation_upload, general_follow_up
   - Status tracking: draft, queued, sent, failed
   - Trigger reasons: missing_items_detected, supplement_opportunity, approval_pending_too_long, manual_trigger, homeowner_forwarded_adjuster_info
   - Stores related data from other blocks (missing items, supplement values, insurance RCV/ACV, SmartSend estimates)

#### Extended Tables:

- **`inbox_threads`** - Added `insurance_adjuster_email` field
- **`insurance_timeline_events`** - Added `ADJUSTER_CONTACTED` event type

#### Database Functions:

1. **`detect_adjuster_email_triggers(p_thread_id)`**
   - Detects triggers for adjuster email generation
   - Checks for missing items (from Block 20380)
   - Checks for supplement opportunities (from Block 20490)
   - Checks for approval pending too long (from Block 20460)
   - Checks for pricing disputes (SmartSend estimate > Insurance RCV)
   - Returns JSONB with triggers and adjuster info

2. **`generate_adjuster_email_content(p_thread_id, p_email_type, p_trigger_reason)`**
   - Generates professional adjuster email content
   - Supports: supplement_request, approval_nudge, pricing_dispute, general_follow_up
   - Uses contractor info, homeowner info, claim details
   - Returns subject, body_html, body_text

3. **`create_adjuster_contacted_event(p_thread_id, p_email_type, p_reason)`**
   - Creates ADJUSTER_CONTACTED timeline event
   - Links to thread, contact, and lead
   - Stores email type and reason in event payload

### 2. API Endpoints

#### GET `/api/inbox/adjuster/triggers?thread_id=xxx`
- Detects triggers for adjuster email generation
- Calls `detect_adjuster_email_triggers` database function
- Returns triggers with priorities and recommended actions

#### POST `/api/inbox/adjuster/generate`
- Generates professional adjuster email content using AI (OpenAI GPT-4o-mini)
- Body: `{ thread_id, email_type, trigger_reason }`
- Fetches thread data, contact info, contractor settings
- Uses AI to generate personalized email content
- Saves draft to `adjuster_emails` table
- Returns generated email (subject, body_html, body_text)

#### POST `/api/inbox/adjuster/send`
- Sends an adjuster email (queues it for sending)
- Body: `{ adjuster_email_id }` or `{ thread_id }`
- Queues email via existing `outbox` system
- Updates adjuster_email status to "queued"
- Creates timeline event via `create_adjuster_contacted_event`

### 3. UI Components

#### `src/components/inbox/AdjusterToolsCard.tsx`
- Displays adjuster communication tools in inbox sidebar
- Shows detected triggers with priorities
- High priority triggers: Missing items detected (with list)
- Medium priority triggers: Approval pending too long, Pricing disputes
- Action buttons:
  - "Send Supplement Email" (for missing items)
  - "Follow Up Again" (for approval nudges)
  - "Dispute Pricing" (for pricing disputes)
  - "Message Adjuster" (manual trigger)
- Email preview dialog with send/cancel buttons
- Only shows when adjuster email is available

#### Updated Components:

- **`components/inbox/InsuranceClaimCard.tsx`**
  - Added `initialAdjusterEmail` prop
  - Added adjuster email input field
  - Saves adjuster email to database

- **`src/app/inbox/components/ConversationView.tsx`**
  - Integrated `AdjusterToolsCard` into right sidebar
  - Positioned after `InsuranceClaimCard`
  - Passes adjuster email, name, and claim number props

- **`app/api/inbox/insurance-claim/route.ts`**
  - Updated to handle `insurance_adjuster_email` field
  - Saves adjuster email when insurance claim info is updated

### 4. Trigger Logic

SmartSend automatically detects when adjuster emails should be generated:

1. **Missing Items Detected** (from Block 20380)
   - When scope parser finds missing code-required items
   - Triggers supplement request email

2. **Supplement Opportunity** (from Block 20490)
   - When estimator suggests supplement opportunities
   - Triggers supplement request email

3. **Approval Pending Too Long** (from Block 20460)
   - When claim status is "under_review" or "supplements_needed"
   - And no adjuster activity for 7+ days
   - Triggers approval nudge email

4. **Pricing Dispute**
   - When SmartSend estimate > Insurance RCV by >10%
   - Triggers pricing clarification email

5. **Manual Trigger**
   - Contractor clicks "Message Adjuster" button
   - Generates general follow-up email

### 5. Email Templates

#### A) Supplement Request Email
- Subject: "Supplement Request — Missing Items on Claim #[number]"
- Includes: Missing items list, building code references, professional tone
- References: Claim number, homeowner name, carrier

#### B) Approval Nudge Email
- Subject: "Follow-Up — Claim #[number] (Pending Approval)"
- Includes: Days since last activity, professional follow-up
- References: Documentation submission date, homeowner waiting status

#### C) Pricing Dispute Email
- Subject: "Pricing Clarification — Claim #[number]"
- Includes: Scope details (squares, steep charge, 2-story), RCV comparison
- References: Market rates, SmartSend estimate, local pricing

#### D) General Follow-Up Email
- Subject: "Follow-Up — Claim #[number]"
- Generic professional follow-up template

### 6. Integration Points

- **Block 20380** (Scope Parser): Provides missing items data
- **Block 20490** (Estimator): Provides supplement opportunities and estimates
- **Block 20460** (Timeline): Provides approval status and activity tracking
- **Block 20360** (Insurance Brain): Provides carrier, claim status, deductible info
- **Existing Email Infrastructure**: Uses `outbox` table and existing email sending system

### 7. Security & Permissions

- Row Level Security (RLS) enabled on `adjuster_emails` table
- Users can only see/adjuster emails for threads in their workspace
- Policies check workspace membership via `workspace_members` table

## 🎯 Key Features

✅ **Automatic Trigger Detection** - Detects when adjuster emails are needed
✅ **AI-Powered Email Generation** - Uses OpenAI to generate professional emails
✅ **Multiple Email Types** - Supplement requests, approval nudges, pricing disputes
✅ **Professional Templates** - Insurance-accurate, carrier-aware templates
✅ **Timeline Integration** - Creates timeline events when emails are sent
✅ **UI Integration** - Adjuster Tools card in inbox sidebar
✅ **Email Preview** - Review emails before sending
✅ **Queue Integration** - Uses existing email sending infrastructure

## 📝 Usage

1. **Add Adjuster Email**: Enter adjuster email in Insurance Claim card
2. **View Triggers**: Adjuster Tools card shows detected triggers
3. **Generate Email**: Click action button (e.g., "Send Supplement Email")
4. **Review Email**: Preview dialog shows generated email
5. **Send Email**: Click "Send Email" to queue for sending

## 🔄 Next Steps (Future Enhancements)

- [ ] Add photo attachments to emails (v2)
- [ ] Add estimate PDF attachments (v2)
- [ ] Add local code citations (v2.5)
- [ ] Carrier-specific tone adjustments (State Farm vs Allstate vs USAA)
- [ ] Adjuster style detection (if name/email pattern known)
- [ ] Auto-follow-up scheduling (48-hour reminders)
- [ ] Email tracking (opens, replies)

## 📊 Database Schema Summary

```sql
-- New table
adjuster_emails (
  id, thread_id, contact_id, lead_id,
  adjuster_name, adjuster_email, homeowner_name, claim_number,
  email_type, subject, body_html, body_text,
  status, trigger_reason,
  missing_items, supplement_value_estimate, days_since_last_activity,
  insurance_rcv, insurance_acv, smart_send_estimate,
  metadata, created_at, updated_at, sent_at
)

-- Extended table
inbox_threads.insurance_adjuster_email

-- Extended event type
insurance_timeline_events.event_type: 'ADJUSTER_CONTACTED'
```

## 🎉 Impact

This feature transforms SmartSend into a powerful tool for roofing contractors by:
- **Automating** adjuster communication
- **Identifying** missing money opportunities
- **Speeding up** claim approvals
- **Increasing** revenue per job
- **Improving** professionalism in adjuster communications

This makes SmartSend insanely valuable to insurance-based roofing companies.
















































