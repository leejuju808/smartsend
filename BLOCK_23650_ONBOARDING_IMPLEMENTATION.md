# Block 23650 — SmartSend Onboarding Email + SMS Pack v1

## Overview

This implementation provides a complete 7-day onboarding sequence for new SmartSend subscribers. The system automatically sends email and SMS messages at specific intervals to help roofers get started, launch campaigns, and see value quickly.

## What's Included

### 1. Database Migration (`supabase/migrations/20250130000002_block23650_onboarding_email_sms_pack_v1.sql`)

- **`onboarding_messages` table**: Tracks all scheduled and sent onboarding messages
- **Email templates**: 5 email templates for the 7-day sequence
- **SMS templates**: 3 SMS templates for key touchpoints
- **Scheduling function**: `schedule_onboarding_sequence()` - schedules all messages for a new subscriber
- **Trigger**: Automatically schedules onboarding when subscription is created/activated

### 2. API Endpoints

- **`/api/cron/onboarding/send-messages`**: Cron job endpoint that processes and sends pending messages
- **`/api/onboarding/schedule`**: Manual endpoint to trigger onboarding sequence for a user

### 3. Message Schedule

| Day | Message Type | Template Key | Purpose |
|-----|--------------|--------------|---------|
| 0 | Email + SMS | `onboarding_day0_welcome_email`<br>`sms_onboarding_day0_welcome` | Welcome + momentum |
| 1 | Email | `onboarding_day1_launch_campaign1` | Launch campaign #1 |
| 2 | SMS | `sms_onboarding_day2_reminder` | Quick-win reminder |
| 3 | Email | `onboarding_day3_value_proof` | Show value + open rate proof |
| 4 | Email | `onboarding_day4_launch_campaign2` | Push campaign #2 |
| 5 | SMS | `sms_onboarding_day5_checkin` | Personal check-in |
| 7 | Email | `onboarding_day7_summary` | First-week summary + next step |

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Apply the migration
supabase db push
```

Or run manually in Supabase SQL editor:
```sql
-- See supabase/migrations/20250130000002_block23650_onboarding_email_sms_pack_v1.sql
```

### Step 2: Configure Environment Variables

Ensure these are set:
- `RESEND_API_KEY` - For sending emails
- `RESEND_FROM` - Email sender (e.g., "SmartSend <noreply@smartsend.ai>")
- `TWILIO_ACCOUNT_SID` - For SMS (optional)
- `TWILIO_AUTH_TOKEN` - For SMS (optional)
- `TWILIO_PHONE_NUMBER` - For SMS (optional)
- `CRON_SECRET` - Secret for securing cron endpoints

### Step 3: Set Up Cron Job

Schedule the onboarding message sender to run every hour (or more frequently):

**Option A: Vercel Cron**
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/onboarding/send-messages",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Option B: External Cron Service**
Set up a cron job to call:
```
GET https://your-domain.com/api/cron/onboarding/send-messages
Authorization: Bearer YOUR_CRON_SECRET
```

### Step 4: Integrate with Subscription Webhook

When a user subscribes, call the scheduling endpoint:

```typescript
// In your Stripe webhook handler or subscription creation logic
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding/schedule`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: user.id }),
});
```

Or the database trigger will automatically schedule onboarding when a subscription is created/activated.

## How It Works

### 1. Scheduling (On Subscription)

When a user subscribes:
1. `schedule_onboarding_sequence()` function is called (via trigger or API)
2. All 7 messages are scheduled with appropriate day offsets
3. Messages are inserted into `onboarding_messages` table with status `pending`

### 2. Sending (Cron Job)

Every hour, the cron job:
1. Calls `get_pending_onboarding_messages()` to get messages ready to send
2. For each message:
   - Fetches the template from `email_templates` table
   - Sends email via Resend or SMS via Twilio
   - Updates message status to `sent` or `failed`

### 3. Template System

Templates are stored in the `email_templates` table:
- Email templates: `onboarding_day*_*`
- SMS templates: `sms_onboarding_day*_*`
- All templates are global (org_id = null UUID)
- Templates can be customized per organization if needed

## Customization

### Modify Templates

Update templates directly in the database:
```sql
UPDATE email_templates
SET base_body = 'Your custom message here'
WHERE template_key = 'onboarding_day0_welcome_email';
```

### Add Custom Messages

To add messages to the sequence:
1. Insert template into `email_templates`
2. Modify `schedule_onboarding_sequence()` function to schedule the new message
3. Update the cron job if needed

### Skip Messages

To skip a message for a user:
```sql
UPDATE onboarding_messages
SET status = 'skipped'
WHERE user_id = 'user-uuid' AND message_key = 'onboarding_day1_launch_campaign1';
```

## Monitoring

### Check Scheduled Messages

```sql
SELECT 
  om.*,
  u.email,
  u.raw_user_meta_data->>'phone' as phone
FROM onboarding_messages om
JOIN auth.users u ON u.id = om.user_id
WHERE om.user_id = 'user-uuid'
ORDER BY om.day_offset;
```

### Check Send Status

```sql
SELECT 
  status,
  COUNT(*) as count
FROM onboarding_messages
GROUP BY status;
```

### View Failed Messages

```sql
SELECT 
  om.*,
  u.email
FROM onboarding_messages om
JOIN auth.users u ON u.id = om.user_id
WHERE om.status = 'failed'
ORDER BY om.created_at DESC;
```

## Testing

### Manual Test Scheduling

```bash
curl -X POST https://your-domain.com/api/onboarding/schedule \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-uuid"}'
```

### Manual Test Sending

```bash
curl -X GET https://your-domain.com/api/cron/onboarding/send-messages \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Test in Development

1. Create a test user subscription
2. Call `/api/onboarding/schedule` with the user ID
3. Check `onboarding_messages` table to verify scheduling
4. Manually call `/api/cron/onboarding/send-messages` to send messages
5. Verify emails/SMS are received

## Troubleshooting

### Messages Not Scheduling

- Check if subscription trigger is working: `SELECT * FROM subscriptions WHERE user_id = 'user-uuid'`
- Manually call `/api/onboarding/schedule` endpoint
- Check database logs for errors

### Messages Not Sending

- Verify cron job is running
- Check `RESEND_API_KEY` and `TWILIO_*` env vars are set
- Check `onboarding_messages` table for `failed` status messages
- Review error messages in `onboarding_messages.error_message`

### SMS Not Working

- Verify Twilio credentials are configured
- Check phone number format (must be E.164)
- Ensure user has phone number in `auth.users.raw_user_meta_data->>'phone'`

## Future Enhancements

- [ ] Week 2-4 onboarding nudges (bonus messages)
- [ ] Dynamic template personalization based on user activity
- [ ] A/B testing for message variants
- [ ] Analytics dashboard for onboarding metrics
- [ ] Opt-out mechanism for onboarding messages
- [ ] Support for multiple languages

## Onboarding Rules (Never Break These)

1. ✅ Roofers must get a reply within 7 days
2. ✅ Roofers must have at least one campaign live
3. ✅ Roofers must feel like SmartSend is doing everything FOR them
4. ✅ Roofers must see value in simple terms (replies, jobs, dollars)
5. ✅ You must ALWAYS offer to do the action for them

This is how you create 12–24 month retention.






































