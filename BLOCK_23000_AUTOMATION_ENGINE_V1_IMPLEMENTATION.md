# Block 23000 — SmartSend Roofing Automation Engine v1 Implementation

## Overview

This block implements the Automation Engine that makes SmartSend run itself automatically. It's the "Zapier-for-Roofers" inside the OS itself, wiring together all the features (payments, production, field app, AI) so the system runs itself in dozens of little ways.

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000008_block23000_automation_engine_v1.sql`)

#### Tables Created:
- **`automations`** - Stores automation rules (trigger → condition → action)
- **`automation_logs`** - Event log showing which automations fired and their results
- **`automation_events`** - Event bus for automation triggers

#### Key Features:
- Automations are scoped per workspace
- Support for 8 trigger event types:
  - `invoice_created`
  - `invoice_status_changed`
  - `job_progress_updated`
  - `job_status_changed`
  - `field_session_checked_in`
  - `field_session_checked_out`
  - `material_order_status_changed`
  - `ai_insight_created`
- JSON-based conditions for flexible rule matching
- JSON-based actions array for multiple actions per automation
- Row-level security policies for workspace isolation

#### Database Triggers:
Automatically fire automation events when key events happen:
- Invoice created/status changed → fires `invoice_created` / `invoice_status_changed` events
- Job status changed → fires `job_status_changed` events
- Job progress updated → fires `job_progress_updated` events
- Field session checked in/out → fires `field_session_checked_in` / `field_session_checked_out` events
- Material order status changed → fires `material_order_status_changed` events
- AI insight created → fires `ai_insight_created` events

### 2. Automation Engine Edge Function (`supabase/functions/automation-engine/index.ts`)

The central worker that:
- Polls `automation_events` table for unprocessed events (limit 50 per run)
- Matches events to active automations for the workspace
- Evaluates conditions (simple V1 logic: equals, not_equals, age_days_gt)
- Executes actions:
  - `send_email` - Send email to homeowner (placeholder for now)
  - `create_production_alert` - Create production alert
  - `update_job_flag` - Mark job as attention_required
  - `create_ai_insight` - Create AI insight
  - `create_notification` - Create in-app notification (placeholder)
  - `update_job_status` - Update job status
  - `update_job_tag` - Update job tag (placeholder)
- Logs success/error to `automation_logs`
- Marks events as processed

### 3. Automation Settings UI (`app/(dashboard)/settings/automations/page.tsx`)

Owner-facing page with three tabs:

#### Recommended Automations
Pre-built automation templates that roofers can enable with one click:
1. **Invoice Overdue Reminder** - Send payment reminder + alert when invoice unpaid 3+ days
2. **Job Completed → Send Review Request** - Send review request when job completed
3. **Material Delayed → Alert Owner** - Alert owner when material order delayed
4. **Margin Risk from AI → Owner Alert** - Alert owner when AI detects margin risk
5. **Crew Check-In → Homeowner Notification** - Send "We're on the way" message when crew checks in

#### Active Automations
- List of all automations for the workspace
- Toggle active/inactive status
- Shows trigger event and actions

#### Logs
- Recent automation execution logs
- Shows success/error status
- Displays trigger event and message

### 4. Settings Navigation Integration

Added "Automations" link to the main settings page navigation (`src/app/(dashboard)/settings/page.tsx`).

## Example Automations (Pre-seeded)

### 1. Overdue Invoice Reminder
```json
{
  "name": "Invoice Overdue Reminder",
  "trigger_event": "invoice_status_changed",
  "condition": {
    "field": "invoice.status",
    "equals": "sent",
    "age_days_gt": 3
  },
  "actions": [
    {
      "type": "send_email",
      "template": "invoice_overdue_reminder"
    },
    {
      "type": "create_production_alert",
      "severity": "warning",
      "message": "Invoice overdue 3+ days"
    }
  ]
}
```

### 2. Job Completed → Review Request
```json
{
  "name": "Job Completed → Send Review Request",
  "trigger_event": "job_status_changed",
  "condition": {
    "field": "job.status",
    "equals": "completed"
  },
  "actions": [
    {
      "type": "send_email",
      "template": "review_request"
    },
    {
      "type": "update_job_flag"
    }
  ]
}
```

## How It Works

1. **Event Firing**: When something important happens (e.g., invoice created, job status changed), a database trigger automatically inserts a row into `automation_events`.

2. **Event Processing**: The automation engine edge function runs periodically (via cron or manual invocation) and:
   - Fetches unprocessed events
   - For each event, finds matching automations (same workspace + trigger_event + is_active)
   - Evaluates conditions
   - Executes actions
   - Logs results

3. **Action Execution**: Actions are executed sequentially. If one fails, the error is logged but other actions continue.

## Deployment Steps

1. **Run Migration**:
   ```bash
   # Apply the migration in Supabase SQL Editor or via CLI
   supabase db push
   ```

2. **Deploy Edge Function**:
   ```bash
   cd supabase
   supabase functions deploy automation-engine
   ```

3. **Set Up Cron Job** (Optional):
   ```sql
   -- Schedule automation engine to run every minute
   SELECT cron.schedule(
     'automation-engine',
     '* * * * *', -- every minute
     $$
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/automation-engine',
       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     $$
   );
   ```

4. **Access UI**:
   Navigate to `/settings/automations` in the app.

## Next Steps (V2 Enhancements)

- Visual builder for creating automations
- More action types (SMS, webhooks, etc.)
- Nested conditions (AND/OR logic)
- Rate limiting and throttling
- Email template integration (Resend, Postmark, etc.)
- More trigger events
- Automation analytics dashboard

## Files Created/Modified

- `supabase/migrations/20250130000008_block23000_automation_engine_v1.sql` - Database schema
- `supabase/functions/automation-engine/index.ts` - Automation engine worker
- `app/(dashboard)/settings/automations/page.tsx` - UI page
- `src/app/(dashboard)/settings/page.tsx` - Added automations link

## Testing

To test the automation engine:

1. Create an automation via the UI
2. Trigger an event (e.g., create an invoice, change job status)
3. Manually invoke the edge function or wait for cron
4. Check automation_logs to see if it fired
5. Verify actions were executed (e.g., production alert created)

## Notes

- The `send_email` action is currently a placeholder. Integrate with your email provider (Resend, Postmark, etc.) in V2.
- The automation engine processes events synchronously. For high-volume scenarios, consider batching or async processing in V2.
- All triggers use `SECURITY DEFINER` to bypass RLS when inserting events, which is safe since they're system-generated events.







































