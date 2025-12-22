# Block 20770 — SmartSend Roofing Notification Engine v1
## Implementation Summary

This document summarizes the implementation of Block 20770 - SmartSend Roofing Notification Engine v1, which provides real-time alerts for homeowner replies, claim approvals, adjuster responses, install-ready signals, missed follow-ups, supplement opportunities, and urgent alerts.

## ✅ Implementation Complete

### 1. Database Schema (`supabase/migrations/20250201000005_block20770_roofing_notification_engine_v1.sql`)

#### Tables Created/Extended:

1. **`notifications`** - Core notifications table
   - Links to user, workspace, lead, thread, job, campaign
   - Notification types covering all scenarios from spec
   - Payload JSONB for flexible data storage
   - Read/unread tracking

2. **`notification_frequency_tracking`** - Anti-spam tracking
   - Tracks when notifications were last sent
   - Prevents notification spam
   - Respects cooldown periods

#### Database Functions Created:

1. **`should_send_notification()`** - Frequency checking (anti-spam)
   - Enforces cooldown periods:
     - Homeowner replies: 10 minutes
     - Adjuster replies: 1 hour
     - Missed follow-ups: 24 hours
     - Install-ready: Only once per entity
     - Supplement opportunities: Only once per entity

2. **`create_roofing_notification()`** - Core notification creation
   - Creates notifications with frequency checking
   - Handles workspace resolution
   - Records notification sent for tracking

3. **Notification Type-Specific Functions:**
   - `notify_homeowner_replied()` - Homeowner reply notifications
   - `notify_claim_approved()` - Claim approval notifications
   - `notify_adjuster_responded()` - Adjuster response notifications
   - `notify_install_ready()` - Install-ready notifications
   - `notify_missed_follow_up()` - Missed follow-up notifications
   - `notify_supplement_opportunity()` - Supplement opportunity notifications
   - `notify_urgent_alert()` - Urgent alert notifications

4. **Detection Functions:**
   - `detect_install_ready()` - Detects if thread is install-ready
   - `detect_missed_follow_ups()` - Detects all missed follow-ups
   - `check_and_notify_missed_follow_ups()` - Cron-ready function to check and notify

#### Triggers Created:

1. **`trg_notification_from_activity_feed`** - Auto-creates notifications from activity feed events
   - Triggers on: homeowner_replied, claim_approved, adjuster_responded, stage_install_ready, supplement_items_detected, claim_denied, adjuster_unresponsive_72h, homeowner_replied_waiting

2. **`trg_notification_proposal_sent`** - Tracks proposal sends (for follow-up detection)

### 2. API Endpoints (`app/api/notifications/`)

#### GET `/api/notifications`
- Fetches notifications for current user
- Supports filtering:
  - `unread_only` - Only unread notifications
  - `type` - Filter by notification type
  - `limit` / `offset` - Pagination
- Returns notifications with unread count

#### POST `/api/notifications`
- Marks notifications as read
- Supports:
  - Single notification: `{ notification_id }`
  - Mark all as read: `{ mark_all_read: true }`

#### POST `/api/notifications/[id]/read`
- Marks a specific notification as read

### 3. Email Notification System (`lib/notifications/email.ts`)

- **`sendEmailNotification()`** - Sends email notifications to users
- Builds HTML email templates with:
  - Emoji prefixes based on notification type
  - Formatted notification content
  - Action buttons linking to SmartSend
  - Payload details (project value, claim amount, etc.)
- Integrates with Resend email provider
- Tracks email sent status in notification payload

### 4. Notification Types Implemented

#### 🟢 Homeowner Activity
- `homeowner_replied` - Homeowner replied to proposal/message
- `homeowner_buying_signal` - Homeowner shows buying signals
- `homeowner_question` - Homeowner asks a question
- `homeowner_schedule_request` - Homeowner asks to schedule
- `homeowner_uploaded_adjuster_email` - Homeowner uploaded adjuster email
- `homeowner_wants_to_move_forward` - Homeowner says "we want to move forward"

#### 🔵 Insurance Claims
- `claim_approved` - Insurance claim approved
- `claim_status_changed` - Claim status changed to RCV or ACV
- `adjuster_approval_letter` - Adjuster sent approval letter

#### 🟣 Adjuster Communications
- `adjuster_replied` - Adjuster replied
- `adjuster_asked_for_photos` - Adjuster asked for photos
- `adjuster_scheduled_inspection` - Adjuster scheduled new inspection
- `adjuster_approved_supplement` - Adjuster approved supplement
- `adjuster_denied_supplement` - Adjuster denied supplement

#### 🔥 Install-Ready
- `install_ready` - All signals point to install-ready

#### ⚠️ Follow-Ups
- `missed_follow_up_hot_lead` - Hot lead has no contact >24 hrs
- `missed_follow_up_homeowner` - Homeowner waiting >12 hrs
- `missed_follow_up_adjuster` - Adjuster unresponsive for 48 hrs
- `missed_follow_up_proposal` - Proposal sent but no follow-up in 24 hrs

#### 🟠 Supplement Opportunities
- `supplement_opportunity_detected` - Missing items detected (steep charge, drip edge, ice & water, ridge vent, O&P)

#### 🔴 Urgent Alerts
- `adjuster_denied_claim` - Adjuster denied claim
- `homeowner_reported_leak` - Homeowner reports leak/water damage
- `homeowner_hired_another_company` - Homeowner says "I hired another company"
- `homeowner_complained_delays` - Homeowner complains about delays

### 5. Frequency Rules (Anti-Spam)

SmartSend NEVER spams. Rules implemented:

- ✅ Only send 1 homeowner reply notification per 10 minutes
- ✅ Only send 1 adjuster follow-up reminder per day
- ✅ Only send install-ready ONCE (unless new activity triggers again)
- ✅ Only send supplement opportunity ONCE unless updated
- ✅ Only send pending deal follow-up every 24 hours max

### 6. Integration Points

#### Activity Feed Integration
- Automatically creates notifications when activity feed events are created
- Supports all event types from Block 20680

#### Proposal Integration
- Tracks proposal sends for follow-up detection
- Triggers missed follow-up notifications after 24 hours

#### Claim Status Integration
- Monitors claim status changes
- Triggers notifications on approval/denial

#### Adjuster Email Integration
- Integrates with Block 20590 (Adjuster Communication Engine)
- Triggers notifications on adjuster responses

## 📊 Database Schema Summary

```sql
-- Notifications table
notifications (
  id, user_id, workspace_id, lead_id, thread_id, job_id, campaign_id,
  type, title, body, payload (jsonb),
  is_read, read_at, created_at
)

-- Frequency tracking table
notification_frequency_tracking (
  id, user_id, notification_type, entity_id,
  last_sent_at, created_at
)
```

## 🎯 Usage Examples

### Creating a Notification (from code)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

// Create homeowner reply notification
await supabase.rpc('notify_homeowner_replied', {
  p_thread_id: threadId,
  p_message_preview: 'When can we get started?'
});

// Create install-ready notification
await supabase.rpc('notify_install_ready', {
  p_thread_id: threadId,
  p_project_value: 22680
});

// Create missed follow-up notification
await supabase.rpc('notify_missed_follow_up', {
  p_thread_id: threadId,
  p_follow_up_type: 'hot_lead',
  p_hours_since_contact: 24
});
```

### Fetching Notifications (from frontend)

```typescript
// Get unread notifications
const response = await fetch('/api/notifications?unread_only=true');
const { notifications, unread_count } = await response.json();

// Mark as read
await fetch('/api/notifications', {
  method: 'POST',
  body: JSON.stringify({ notification_id: notificationId })
});
```

### Sending Email Notifications

```typescript
import { sendEmailNotification } from '@/lib/notifications/email';

await sendEmailNotification({
  userId: user.id,
  notificationId: notification.id,
  title: notification.title,
  body: notification.body,
  type: notification.type,
  payload: notification.payload
});
```

## 🔄 Cron Jobs (Recommended)

Set up cron jobs to check for missed follow-ups:

```sql
-- Run every hour
SELECT public.check_and_notify_missed_follow_ups();
```

## 🎉 Impact

This feature transforms SmartSend into a 24/7 roofing assistant that:

- ✅ **Keeps roofers aware** - Real-time notifications for all important events
- ✅ **Shows the money** - Highlights project values, claim amounts, supplement opportunities
- ✅ **Warns about missed deals** - Alerts for hot leads needing follow-up
- ✅ **Alerts to approvals** - Instant notification when claims are approved
- ✅ **Notifies about homeowner responses** - Fast action required alerts
- ✅ **Pushes install-ready leads to the top** - High-value opportunities highlighted
- ✅ **Drives more installs and revenue** - Never miss a deal again

This makes SmartSend feel ALIVE and helps roofing companies close more jobs reliably.

## 📝 Next Steps (v2)

- [ ] Push notifications (mobile app)
- [ ] SMS notifications for urgent alerts
- [ ] Notification preferences/settings UI
- [ ] Notification digest emails (daily summary)
- [ ] Real-time WebSocket updates for instant notifications
- [ ] Notification grouping (similar notifications grouped together)
















































