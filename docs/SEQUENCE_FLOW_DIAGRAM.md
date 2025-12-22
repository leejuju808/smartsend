# Email Sequence Flow Diagram

## High-Level Flow

```
User Creates Sequence
        ↓
Define Steps (subject, body, wait_days, send_window)
        ↓
Save Sequence (POST /api/sequences/[campaignId]/upsert)
        ↓
Start Sequence for Leads (POST /api/sequences/[campaignId]/start)
        ↓
Step 1: Enqueued in email_jobs (scheduled_at = now)
        ↓
Queue Dispatcher sends Step 1
        ↓
        ├─→ Success → planNextStepFor()
        │              ├─→ Update sequence_progress
        │              ├─→ Calculate next send time
        │              └─→ Enqueue Step 2 at calculated time
        │
        └─→ Failure → Retry logic → Eventually queued again
                           ↓
                    Success → planNextStepFor()

[Repeat for Step 2, Step 3, etc.]

        ↓
Last Step Sent
        ↓
Mark sequence_progress status = 'finished'
```

## Database Flow

```
sequences (1 row per campaign)
    ↓
sequence_steps (N rows per sequence, ordered by position)
    ↓
sequence_progress (1 row per lead, tracks current_position)
    ↓
email_jobs (queued emails, scheduled for each step)
```

## Auto-Pause Triggers

```
Reply Detected
    ↓
handleReplyForSequence()
    ↓
cancel_future_queue() → email_jobs.status = 'canceled'
    ↓
sequence_progress.status = 'stopped'

─────────────────────

Unsubscribe Clicked
    ↓
applyGlobalUnsub() or applySequenceUnsub()
    ↓
cancel_future_queue() → email_jobs.status = 'canceled'
    ↓
sequence_progress.status = 'stopped'
```

## Sequence Progress States

```
active  → Emails sending normally
paused  → Manually paused by user
stopped → Auto-paused (reply/unsubscribe)
finished → All steps completed
```

## Timing Calculation

```
Step 1 sent at: 2025-01-27 10:00 AM
Wait days: 3
Send window: 9:00 AM - 5:00 PM, Mon-Fri
Timezone: America/Los_Angeles

Calculation:
1. Base time: Jan 27 + 3 days = Jan 30
2. Check if weekday: Jan 30 is Thursday → ✓
3. Check business hours: 10:00 AM → ✓
4. Next send: Jan 30, 2025 9:00 AM PST

Step 2 scheduled for: 2025-01-30 9:00 AM
```

## Sequence Editor UI

```
┌─────────────────────────────────────────┐
│ Sequence Name: [My Follow-up Sequence]  │
│                                          │
│ [+ Add Step] [Save Sequence]             │
├─────────────────────────────────────────┤
│ Step 1                                   │
│ Subject: [Welcome email]               │
│ Wait Days: [0]                           │
│ Body: [<p>Hi {{first_name}}...</p>]    │
│ [Remove]                                 │
├─────────────────────────────────────────┤
│ Step 2                                   │
│ Subject: [Following up]                  │
│ Wait Days: [3]                           │
│ Body: [<p>Just checking in...</p>]       │
│ [Remove]                                 │
└─────────────────────────────────────────┘
```

## Integration Points

### Reply Detection
```
Inbound email arrives
    ↓
Reply processor classifies intent
    ↓
IF positive reply → handleReplyForSequence()
    ↓
Cancel future emails
```

### Unsubscribe Handler
```
User clicks unsubscribe link
    ↓
applyGlobalUnsub() or applySequenceUnsub()
    ↓
Call cancel_future_queue RPC
    ↓
Update sequence_progress
```

### Worker After Send
```
Email sent successfully
    ↓
IF has campaign_id AND lead_id
    ↓
planNextStepFor(job)
    ↓
Find sequence for campaign
    ↓
Check if more steps exist
    ↓
Schedule next step OR mark finished
```

## Example Timeline

```
Day 0 (Monday, 10:00 AM)
  → Step 1 sent to all leads

Day 3 (Thursday, 9:00 AM)
  → Step 2 sent to all leads who didn't reply/unsubscribe

Day 8 (Tuesday, 10:00 AM)
  → Step 3 sent to remaining leads

Day 15 (Wednesday, 9:00 AM)
  → Step 4 sent to remaining leads

Day 20 (Monday, 9:00 AM)
  → Sequence complete, all marked 'finished'
```
