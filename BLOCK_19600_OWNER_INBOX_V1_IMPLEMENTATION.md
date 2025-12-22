# Block 19600 — SmartSend Owner Inbox v1 Implementation

## Overview

The Unified Roofing Inbox: All Replies, All Channels, AI Sorting, Lead Ranking & Action Buttons

This block provides roofing owners with ONE place to see every reply, every hot lead, every follow-up, with zero confusion. This is where SmartSend becomes mission control for booked jobs.

## Features Implemented

### 1. Unified Inbox (Email Replies Only for v1)
- ✅ All campaign replies flow into one clean dashboard
- ✅ Thread view with message history
- ✅ Quick filters (Hot • Warm • Cold • Not Interested • Follow-Up)

### 2. AI Intent Classification (Auto-Tagging)
- ✅ Tags applied on arrival:
  - **Hot Lead** (Ready for Estimate)
  - **Warm Lead** (Interested but asks Qs)
  - **Cold Lead** (Not interested)
  - **Dead Lead** (Not interested)
  - **Follow-Up Needed** (didn't answer your question)

### 3. Lead Ranking Score (0–100)
- ✅ Based on:
  - Keywords ("leak," "need quote," "missing shingles")
  - Positive tone
  - Time urgency
  - Location match
  - Damage severity

### 4. One-Tap Action Buttons (Owner Tools)
- ✅ Each reply row gets:
  - **Call Now** - Opens phone dialer
  - **Send Estimate Link** - Generates and copies estimate link
  - **Mark as Booked** - Closes thread and marks lead as booked
  - **Add Task** - Creates follow-up task
  - **Add to CRM** - Exports lead data to CRM

### 5. Instant Lead Card (Right Panel)
- ✅ When you click a reply, the right side shows:
  - Homeowner name + email
  - Message thread
  - AI-generated summary
  - Recommended response
  - Lead value range
  - Follow-up timer ("Reach out within 6 hrs to close")

### 6. Automated Urgency Alerts
- ✅ If a HOT lead arrives:
  - Dashboard highlight (red flash)
  - "Respond within 10 min → 80% win rate" reminder
  - Alert stored in `inbox_urgency_alerts` table
  - Push/email notifications (infrastructure ready, needs service integration)

## Technical Implementation

### Database Schema

**Migration File**: `supabase/migrations/20250130000001_block19600_owner_inbox_v1.sql`

#### Enhanced Tables

1. **inbox_messages** - Added AI classification fields:
   - `ai_intent_tag` - Classification tag (hot_lead, warm_lead, etc.)
   - `ai_intent_confidence` - Confidence score (0-1)
   - `ai_classified_at` - When classification happened
   - `ai_summary` - AI-generated summary
   - `ai_recommended_response` - AI-generated response suggestion

2. **inbox_threads** - Added lead ranking fields:
   - `lead_ranking_score` - Score 0-100
   - `lead_ranking_updated_at` - Last score update
   - `urgency_alert_sent` - Whether alert was sent
   - `homeowner_name` - Extracted from messages
   - `homeowner_email` - Extracted from messages
   - `lead_value_range` - Estimated job value
   - `follow_up_timer_hours` - Recommended follow-up time

3. **inbox_urgency_alerts** - New table for alerts:
   - Stores push/email/dashboard alerts
   - Links to threads and messages
   - Tracks alert type and metadata

#### Database Functions

1. **`classify_reply_intent(p_message_id, p_body_text, p_subject)`**
   - Auto-tags replies based on keyword matching
   - Returns intent tag and confidence score
   - Updates message with classification

2. **`calculate_lead_ranking_score(p_thread_id)`**
   - Calculates 0-100 score based on:
     - Keywords (0-40 points)
     - Positive tone (0-15 points)
     - Time urgency (0-20 points)
     - Damage severity (0-15 points)
     - Location match (0-10 points)
   - Updates thread with score

3. **`send_hot_lead_alerts(p_thread_id, p_message_id)`**
   - Sends alerts when HOT lead (score >= 80) is detected
   - Creates dashboard alert
   - Marks thread as alert sent

4. **`get_inbox_replies(p_campaign_id, p_intent_filter, p_min_score, p_limit)`**
   - Returns filtered list of replies
   - Supports filtering by campaign, intent, and minimum score

#### Triggers

1. **`trigger_auto_classify_reply()`**
   - Runs on INSERT to `inbox_messages`
   - Auto-classifies inbound messages
   - Calculates lead ranking score
   - Extracts homeowner info

2. **`trigger_send_hot_lead_alerts()`**
   - Runs on UPDATE to `inbox_messages` when intent becomes "hot_lead"
   - Sends urgency alerts

### API Endpoints

1. **GET `/api/inbox/replies`**
   - Returns filtered list of replies
   - Query params: `campaignId`, `intent`, `minScore`, `limit`
   - Uses `get_inbox_replies()` database function

2. **GET `/api/inbox/replies/[threadId]`**
   - Returns thread detail with lead card data
   - Includes messages, AI summary, recommended response
   - Calculates follow-up timer

3. **POST `/api/inbox/replies/[threadId]/actions`**
   - Handles one-tap action buttons
   - Actions: `call_now`, `send_estimate_link`, `mark_as_booked`, `add_task`, `add_to_crm`
   - Returns action result or error

### Frontend Components

1. **`app/(dashboard)/inbox-v1/page.tsx`**
   - Main inbox page with split-pane layout
   - Left: Reply list with filters
   - Right: Lead card detail panel
   - Real-time updates via Supabase channel

2. **`components/inbox-v1/InboxFilters.tsx`**
   - Quick filter buttons (All, Hot, Warm, Cold, Not Interested, Follow-Up)
   - Color-coded filter states

3. **`components/inbox-v1/InboxReplyList.tsx`**
   - Displays list of replies
   - Shows lead ranking score, intent badges, unread count
   - Click to select thread

4. **`components/inbox-v1/InboxLeadCard.tsx`**
   - Right panel with lead details
   - Message thread display
   - AI summary and recommended response
   - Follow-up timer display

5. **`components/inbox-v1/InboxActionButtons.tsx`**
   - One-tap action buttons row
   - Handles all action types
   - Shows loading states and results

### Real-Time Updates

- Subscribes to `inbox_messages` and `inbox_threads` tables
- Automatically reloads replies when changes occur
- Uses Supabase real-time channels

## Usage

### Accessing the Inbox

Navigate to `/inbox-v1` to access the Owner Inbox.

### Filtering Replies

Use the quick filter buttons to filter by intent:
- **All** - Show all replies
- **Hot** - Show only hot leads (score >= 80 or intent = hot_lead)
- **Warm** - Show warm leads
- **Cold** - Show cold leads
- **Not Interested** - Show dead leads
- **Follow-Up** - Show replies needing follow-up

### Using Action Buttons

1. **Call Now** - Click to open phone dialer with homeowner's number
2. **Send Estimate** - Generates estimate link and copies to clipboard
3. **Mark Booked** - Marks thread as closed and lead as booked
4. **Add Task** - Creates follow-up task (requires tasks table)
5. **Add to CRM** - Exports lead data (requires CRM integration)

### Understanding Lead Scores

- **80-100**: HOT Lead - Respond ASAP (within 10 min for 80% win rate)
- **60-79**: WARM Lead - Respond within 24 hours
- **40-59**: COLD Lead - Standard follow-up
- **0-39**: Low priority - Follow standard cadence

## Next Steps (Future Enhancements)

1. **Push Notifications**: Integrate with push notification service
2. **Email Alerts**: Send email notifications for HOT leads
3. **AI Summary Enhancement**: Use LLM for better summaries
4. **Recommended Response Enhancement**: Use LLM for personalized responses
5. **CRM Integration**: Connect to actual CRM systems
6. **Task System Integration**: Full integration with task management
7. **Multi-Channel Support**: Add SMS, phone call logs, etc.
8. **Advanced Filtering**: Add date ranges, campaign filters, etc.

## Database Migration

Run the migration to set up the schema:

```bash
# Migration is automatically applied when deployed
# Or manually via Supabase dashboard
```

## Testing

1. Send a test email reply to a campaign
2. Check that it appears in `/inbox-v1`
3. Verify AI classification is applied
4. Check lead ranking score is calculated
5. Test action buttons
6. Verify real-time updates work

## Notes

- AI classification uses keyword matching (can be enhanced with LLM)
- Lead ranking score is calculated automatically on reply receipt
- Urgency alerts are stored but push/email need service integration
- Action buttons may require additional setup for tasks/CRM



















































