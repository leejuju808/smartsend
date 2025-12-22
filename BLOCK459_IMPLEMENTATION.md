# Block 459 — Multi-Channel Steps v1 Implementation

## Overview
This implementation adds multi-channel support to SmartSend sequences, enabling Email, SMS, Call Tasks, LinkedIn Tasks, and Manual Tasks within unified sequences.

## Database Changes

### Migration File
`supabase/migrations/20250130000001_block459_multichannel_steps_v1.sql`

### Key Changes

#### 1. Campaign Steps Extended
- Added `step_type` column: `email | sms | call | linkedin | manual`
- Added SMS configuration fields:
  - `sms_body`, `sms_phone_field`, `sms_provider`
  - `sms_send_window_start/end`, `sms_throttle_per_hour`
- Added Call task configuration:
  - `call_script`, `call_notes_template`, `call_deadline_hours`
  - `call_auto_assign_to`, `call_priority`
- Added LinkedIn task configuration:
  - `linkedin_action`, `linkedin_message_text`, `linkedin_instructions`
  - `linkedin_auto_assign_to`
- Added Manual task configuration:
  - `manual_task_title`, `manual_task_description`
  - `manual_task_auto_assign_to`, `manual_task_deadline_hours`

#### 2. Tasks Table Created
New `tasks` table for call, LinkedIn, and manual tasks:
- Fields: `type`, `status`, `due_at`, `assigned_to`, `notes`
- Call-specific: `call_script`, `call_outcome`, `call_duration_seconds`
- LinkedIn-specific: `linkedin_action`, `linkedin_message_text`, `linkedin_profile_url`
- Full RLS policies for workspace-based access

#### 3. Send Queue Extended
- Added `queue_type`: `email | sms`
- Added SMS-specific fields:
  - `sms_body`, `sms_to_phone`, `sms_provider`
  - `sms_status`, `sms_delivered_at`, `sms_failed_at`
  - `sms_provider_message_id`, `sms_error_code`, `sms_error_message`
- Added `campaign_step_id` for better tracking

#### 4. SMS Stats Table
New `sms_stats` table tracking:
- Delivery: `sent_at`, `delivered_at`, `replied_at`, `failed_at`
- Provider info: `provider`, `provider_message_id`, `provider_status`
- Reply tracking: `reply_intent`, `reply_text` (reuses Block 438 system)

#### 5. SMS Suppressions Table
Compliance table for STOP handling:
- `phone_number`, `reason`, `suppressed_at`
- Used to prevent sending to opted-out numbers

#### 6. Multi-Channel Timeline View
`v_lead_timeline` view unifies:
- Email activities from `send_queue`
- SMS activities from `send_queue`
- Task activities from `tasks` table
- Shows unified timeline per lead across all channels

#### 7. Activity Log Table
New `activity_log` table for multi-channel tracking:
- Activity types: `email_sent`, `sms_sent`, `task_created`, `call_completed`, etc.
- JSONB `activity_data` for flexible event storage

#### 8. Helper Functions
- `is_sms_suppressed()`: Check if phone is suppressed
- `create_task_from_step()`: Auto-create tasks from campaign steps
- `is_workspace_member()`: Flexible workspace membership check

## Edge Functions

### SMS Sending Function
`supabase/functions/v1/send-sms/index.ts`

**Features:**
- Supports Twilio, Nexmo/Vonage, Telnyx providers
- Checks SMS suppressions before sending
- Updates `send_queue` with delivery status
- Creates `sms_stats` entries
- Logs activities to `activity_log`
- Handles single queue items or batch processing

**Usage:**
```json
POST /functions/v1/send-sms
{
  "queue_id": "uuid"  // Process single item
}
// OR
{
  "batch": true  // Process up to 10 ready items
}
```

## Implementation Status

### ✅ Completed
1. Database migration with all tables and columns
2. SMS sending Edge Function with multi-provider support
3. Extended send_queue for SMS support
4. SMS stats tracking table
5. SMS suppressions for compliance
6. Tasks table for call/LinkedIn/manual tasks
7. Multi-channel timeline view
8. Activity log table
9. Helper functions for task creation and suppression checks

### 🔄 Next Steps (Application Layer)
1. **Sequence Builder UI**: Update UI to allow selecting step types
2. **Sequence Scheduler**: Update job-runner to handle multi-channel scheduling
3. **Task Dashboard**: Build UI for SDRs to view/manage tasks
4. **SMS Webhook Handler**: Create webhook endpoint for SMS delivery status updates
5. **LinkedIn Integration**: Build LinkedIn task completion UI/workflow
6. **Analytics Views**: Create views for multi-channel analytics
7. **STOP Handler**: Create endpoint to handle SMS STOP requests

## Usage Examples

### Creating an SMS Step
```sql
INSERT INTO campaign_steps (
  campaign_id, step_no, step_type,
  sms_body, sms_phone_field, sms_provider,
  offset_days
) VALUES (
  'campaign-uuid', 2, 'sms',
  'Hi {{first_name}}, quick question about {{company}}...',
  'phone', 'twilio',
  2
);
```

### Creating a Call Task Step
```sql
INSERT INTO campaign_steps (
  campaign_id, step_no, step_type,
  call_script, call_deadline_hours, call_auto_assign_to
) VALUES (
  'campaign-uuid', 3, 'call',
  'Script: Introduce yourself, mention email, ask about pain points...',
  24, 'profile-uuid'
);
```

### Queueing SMS for Sending
```sql
INSERT INTO send_queue (
  campaign_id, lead_id, campaign_step_id,
  queue_type, sms_to_phone, sms_body, sms_provider,
  scheduled_at, status
) VALUES (
  'campaign-uuid', 'lead-uuid', 'step-uuid',
  'sms', '+1234567890', 'Message body...', 'twilio',
  '2025-01-30 10:00:00+00', 'pending'
);
```

### Viewing Lead Timeline
```sql
SELECT * FROM v_lead_timeline 
WHERE lead_id = 'lead-uuid' 
ORDER BY activity_time;
```

## Compliance Notes

- SMS suppressions are checked before every send
- STOP requests should be handled via webhook and added to `sms_suppressions`
- LinkedIn tasks are manual-only (no automated sending) to comply with ToS
- Call tasks log outcomes for compliance tracking

## Integration Points

### SMS Providers
- **Twilio**: Uses Account SID, Auth Token, From Number
- **Nexmo/Vonage**: Uses API Key, API Secret, From Number
- **Telnyx**: Uses API Key, From Number

Configuration can be stored in:
1. Workspace settings (`workspace_settings.sms_config`)
2. Environment variables (`TWILIO_ACCOUNT_SID`, etc.)

### Reply Intent System
SMS replies reuse Block 438 reply intent classifier:
- `interested`, `not_interested`, `maybe`, `unsubscribe`, `other`
- Stored in `sms_stats.reply_intent`

## Testing Checklist

- [ ] Create SMS step in campaign
- [ ] Queue SMS to send_queue
- [ ] Process SMS via Edge Function
- [ ] Verify SMS stats created
- [ ] Test suppression check
- [ ] Create call task step
- [ ] Verify task created from step
- [ ] Test LinkedIn task creation
- [ ] Verify timeline view shows all channels
- [ ] Test activity log entries

## Block 459 Complete ✅

All database infrastructure and core SMS sending functionality is in place. Application-layer UI and workflow integration can now be built on top of this foundation.



