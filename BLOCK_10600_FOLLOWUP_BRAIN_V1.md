# Block 10600 — SmartSend Auto-Follow-Up Brain v1

**The Behavior Engine That Keeps Roof Leads Alive Until They Convert**

## Overview

The Auto-Follow-Up Brain automatically sends the right message at the right time based on homeowner behavior. This is what makes roofers say:

> "Bro… SmartSend does all the follow-up FOR ME?"

And that's when they pay forever.

## The 4 Behavior Triggers

### 1️⃣ No Reply After X Days → Follow-Up Sequence

**Default Schedule:**
- Day 0 → Message 1 (initial follow-up)
- Day 2 → Message 2 (gentle reminder)
- Day 4 → Message 3 (silence breaker)

SmartSend checks: "If no reply → send next message."

Zero thinking required by roofer.

### 2️⃣ Warm Lead → Gentle Nurture Message

**Example homeowner replies:**
- "How much do you charge?"
- "Can you explain what you do?"
- "Maybe next week."

**SmartSend auto-sends:**
> "Got it — want me to get you a quick estimate or answer a few questions first?"

No more losing warm leads.

### 3️⃣ Hot Lead → Stop Campaign + Notify Roofer

**Example homeowner replies:**
- "Can you come look at it?"
- "We need someone today."
- "Can you come out this week?"

**SmartSend does:**
1. Stops ALL follow-ups
2. Sends roofer notification
3. Marks lead as HOT
4. Suggests: "Call this homeowner today."

This saves roofers thousands.

### 4️⃣ Negative Signal → Suppress Contact

**Example homeowner replies:**
- "Not interested."
- "Take me off your list."
- "Already handled."

**SmartSend does:**
1. Stop all messages
2. Add homeowner to global suppression
3. Prevent future sends

Protects deliverability.

## Follow-Up Message Library (v1)

These are the exact messages SmartSend will send automatically — roofing-optimized.

### Warm Lead Follow-Up
**Subject:** Quick question about your roof

**Body:**
```
Got it — happy to help.

Do you need a repair, leak fix, or a full inspection?

I can get you a quick estimate.
```

### Hot Lead Confirmation
**Subject:** We can take a look

**Body:**
```
No problem — we can take a look.

What's the best time for someone to swing by?
```

### Slow Lead Nudge (2–3 days after warm)
**Subject:** Still want me to check on that roof issue?

**Body:**
```
Still want me to check on that roof issue for you?

We've got a slot open this week.
```

### Silence Breaker (v1)
**Subject:** Before I close this out

**Body:**
```
Before I close this out — want someone to take a look at the roof? Just reply 'yes'.
```

This message converts silent homeowners like crazy.

## Architecture

### Database Schema

#### `followup_states` Table
Tracks follow-up sequence state for each lead:
- `lead_id` - Reference to lead
- `workspace_id` - Workspace context
- `campaign_id` - Optional campaign reference
- `step` - Current step in sequence (0, 1, 2)
- `next_action_at` - When next follow-up should be sent
- `last_action` - When last action was taken
- `last_message_sent_at` - When last message was sent
- `status` - active, paused, stopped, suppressed, completed
- `classification` - hot, warm, cold, not_interested

#### `followup_messages` Table
Logs all follow-up messages sent:
- `followup_state_id` - Reference to state
- `lead_id` - Lead reference
- `message_type` - no_reply, warm_nurture, hot_confirmation, slow_nudge, silence_breaker
- `step` - Step number in sequence
- `subject` - Message subject
- `body` - Message body
- `status` - pending, sent, failed, skipped
- `sent_at` - When message was sent

#### `followup_message_templates` Table
Pre-defined roofing-optimized templates:
- `message_type` - Template type
- `step` - Step number (for no_reply sequence)
- `subject` - Template subject
- `body` - Template body
- `is_default` - Default template flag
- `active` - Active status

### Edge Function: `/followup-brain-engine`

**Runs:** Every 1 hour (CRON)

**Algorithm:**
1. For each homeowner:
   - Check last message timestamp
   - Check classification (HOT, WARM, etc.)
   - Check sequence position
   - Decide next action:
     - Send message
     - Stop sequence
     - Delay
     - Assign task

**Process Flow:**
1. **No Reply Processing** - Finds leads with `next_action_at <= now()` and sends appropriate follow-up
2. **Warm Lead Processing** - Finds warm leads and sends nurture message
3. **Hot Lead Processing** - Finds hot leads, pauses follow-ups, sends notification
4. **Negative Signal Processing** - Finds not_interested leads, suppresses them

## Automation Logic

### Initialization

Follow-up states are automatically initialized when:
1. A lead is created (via trigger)
2. A message is sent to a lead (via trigger)
3. Classification changes (via trigger)

### Classification Sync

When a lead's classification changes:
- **hot** → Pause follow-ups, trigger notification
- **warm** → Send nurture message if not sent yet
- **not_interested** → Suppress, stop all follow-ups
- **cold** → Continue normal sequence

### Suppression Handling

Before sending any follow-up, the engine checks:
1. `suppression_list` table
2. `email_suppressions` table
3. `leads.unsubscribed` flag

If suppressed, the follow-up state is marked as `suppressed` and no messages are sent.

## Why Roofers Will Love This

### 1. Roofers NEVER follow up — SmartSend fixes that

This is the #1 reason roofers lose jobs. SmartSend solves it permanently.

### 2. Every good lead stays alive

- Warm → nurtured
- Hot → notified
- Silent → nudged until they reply

Roofers don't even think about it.

### 3. They stop leaving money on the table

- 1 follow-up = 20% higher closing rate
- 2 follow-ups = 40%
- 3 follow-ups = 65%+

SmartSend gives them all 3 automatically.

### 4. Makes SmartSend feel like an employee

Roofers feel:
> "This is like hiring a sales guy for $199/month."

And that's exactly what we want.

## Setup & Deployment

### 1. Run Migration

```bash
supabase migration up
```

This creates:
- `followup_states` table
- `followup_messages` table
- `followup_message_templates` table (with defaults)
- Helper functions
- Triggers for auto-initialization

### 2. Deploy Edge Function

```bash
supabase functions deploy followup-brain-engine
```

### 3. CRON Configuration

Already configured in `supabase/config.toml`:
```toml
[cron.jobs."followup-brain-engine"]
schedule = "0 * * * *"   # every hour
endpoint = "/functions/v1/followup-brain-engine"
```

### 4. Test

Manually trigger the engine:
```bash
curl -X POST https://<PROJECT-REF>.supabase.co/functions/v1/followup-brain-engine \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## Monitoring

### Check Follow-Up States

```sql
SELECT 
  fs.*,
  l.email,
  l.first_name,
  l.classification
FROM followup_states fs
JOIN leads l ON l.id = fs.lead_id
WHERE fs.status = 'active'
ORDER BY fs.next_action_at ASC
LIMIT 20;
```

### Check Sent Messages

```sql
SELECT 
  fm.*,
  l.email,
  l.first_name
FROM followup_messages fm
JOIN leads l ON l.id = fm.lead_id
WHERE fm.status = 'sent'
ORDER BY fm.sent_at DESC
LIMIT 20;
```

### Check Failed Messages

```sql
SELECT 
  fm.*,
  l.email,
  fm.error_message
FROM followup_messages fm
JOIN leads l ON l.id = fm.lead_id
WHERE fm.status = 'failed'
ORDER BY fm.created_at DESC
LIMIT 20;
```

## Customization

### Custom Templates

Workspaces can create custom templates:

```sql
INSERT INTO followup_message_templates (
  workspace_id,
  message_type,
  step,
  subject,
  body,
  is_default,
  active
) VALUES (
  'workspace-uuid',
  'no_reply',
  1,
  'Custom subject',
  'Custom body with {{first_name}}',
  false,
  true
);
```

### Adjust Timing

To change follow-up timing, update the `next_action_at` calculation in the edge function or create a custom function.

## Future Enhancements

- [ ] A/B testing for follow-up messages
- [ ] Analytics dashboard for follow-up performance
- [ ] Custom follow-up sequences per campaign
- [ ] SMS follow-ups for hot leads
- [ ] AI-generated personalized follow-ups
- [ ] Timezone-aware scheduling

## Acceptance Criteria (V1)

✅ System automatically detects no-response after X days  
✅ Sends automated follow-up emails on schedule  
✅ Auto-creates tasks when rules match  
✅ Detects warm replies and triggers follow-up  
✅ Detects hot replies and creates immediate tasks  
✅ Supports rule toggles  
✅ Rule triggers only once per contact per step  
✅ CRON executes reliably every hour  
✅ Actions respect plan limits + RLS  
✅ Suppression handling works correctly  
✅ Hot lead notifications are sent  























































