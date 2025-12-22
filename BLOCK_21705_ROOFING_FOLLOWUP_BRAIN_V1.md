# Block 21705 — SmartSend Roofing Follow-Up Brain v1

**The Core Logic That Makes SmartSend Feel Alive to Roofers**

## Overview

This is one of the highest-ROI features because it directly increases:
- ✔ booked estimates
- ✔ homeowner responses  
- ✔ conversion on every campaign

This is exactly what makes SmartSend a revenue system, not an email sender.

## The 8 Core Rules

### RULE 1: 48 Hours → Follow-Up #1
**Purpose:** gently bump the homeowner  
**Tone:** soft, friendly, helpful  
**Template Goal:** remind them you're available for a quote

**Why roofers love this:** Homeowners forget. 48 hrs after first email is the highest chance to re-engage.

### RULE 2: 4 Days → Follow-Up #2
**Purpose:** establish authority  
**Tone:** clear + value-driven  
**Template Goal:** remind them about storm season, leaks, insurance

**Why roofers love this:** Roofing is urgency-based → "damage risk" works.

### RULE 3: 7 Days → Follow-Up #3
**Purpose:** final nudge  
**Tone:** short + direct  
**Template Goal:** "Should I close your file?"

**Why roofers love this:** High-pressure without being rude → increases replies drastically.

### RULE 4: 14 Days → Archive + Mark "Cold Lead"
SmartSend automatically labels it:
- `cold_lead = true`
- `next_action = none`

Stops follow-ups unless user reactivates.

### RULE 5: If Homeowner Replies ANYTHING → Stop Follow-Ups Immediately
Even a "thanks" → follow-ups disabled.

Follow-up Brain hands control to:
- ✔ Intent Classifier
- ✔ Lead Status Engine
- ✔ Inbox

### RULE 6: If Reply Intent = "Warm Lead" → Auto-Send Thank You + Booking Link
SmartSend replies:
> "Thanks for getting back — here's our quick link to get you on the schedule."

This is MASSIVE ROI. Roofers pay agencies thousands for exactly this: speed-to-lead.

### RULE 7: If Reply Intent = "Hot Lead" → Trigger Priority Status
- pin conversation
- SMS/WhatsApp alert (future version)
- mark `lead_value = high`

Roofers LOVE this: They instantly see $$ in their dashboard.

### RULE 8: If Reply Intent = "Not Interested" → Move to "Unqualified" Bucket
- Stops follow-ups
- No more contact
- Keeps domain safe
- Helps the dashboard stay clean

## Architecture

### Database Schema

#### `roofing_followup_states` Table
Tracks follow-up sequence state for each campaign contact:
- `campaign_contact_id` - Reference to campaign_contacts
- `workspace_id` - Workspace context
- `campaign_id` - Campaign reference
- `initial_email_sent_at` - When first email was sent
- `followup_step` - Current step (0 = initial, 1 = 48hr, 2 = 4day, 3 = 7day)
- `next_followup_at` - When next follow-up should be sent
- `status` - active, paused, stopped, cold_lead, suppressed
- `has_replied` - Whether contact has replied
- `reply_intent` - hot, warm, not_interested, neutral
- `cold_lead` - Marked as cold lead after 14 days

#### `roofing_followup_templates` Table
Pre-defined roofing-optimized templates:
- `followup_step` - 1, 2, or 3
- `subject` - Email subject
- `body` - Email body (supports {{first_name}} placeholders)
- `is_default` - Default template flag
- `is_active` - Active status

#### `roofing_followup_messages` Table
Logs all follow-up messages sent:
- `followup_state_id` - Reference to state
- `campaign_contact_id` - Campaign contact reference
- `followup_step` - Step number (1, 2, or 3)
- `subject` - Message subject
- `body` - Message body
- `status` - pending, sent, failed, skipped
- `sent_at` - When message was sent

### Edge Function: `/roofing-followup-brain-v1`

**Runs:** Every hour (CRON)

**Process Flow:**
1. **Stop Follow-Ups for Replied Contacts** - Checks if contacts have replied and stops follow-ups
2. **Process Warm Leads** - Auto-sends thank you + booking link
3. **Process Hot Leads** - Triggers priority status, pins conversation
4. **Process Not Interested** - Moves to unqualified bucket, suppresses
5. **Process Follow-Up Sequence** - Sends follow-ups at 48hr, 4day, 7day
6. **Archive Cold Leads** - Marks as cold lead after 14 days

## Setup & Deployment

### 1. Run Migration

```bash
supabase migration up
```

This creates:
- `roofing_followup_states` table
- `roofing_followup_templates` table (with default templates)
- `roofing_followup_messages` table
- Helper functions
- Triggers for auto-initialization

### 2. Deploy Edge Function

```bash
supabase functions deploy roofing-followup-brain-v1
```

### 3. CRON Configuration

Already configured in `supabase/config.toml`:
```toml
[cron.jobs."roofing-followup-brain-v1"]
schedule = "0 * * * *"   # every hour
endpoint = "/functions/v1/roofing-followup-brain-v1"
```

### 4. Test

Manually trigger the engine:
```bash
curl -X POST https://<PROJECT-REF>.supabase.co/functions/v1/roofing-followup-brain-v1 \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## How It Works

### Initialization

Follow-up states are automatically initialized when:
1. An email is sent to a campaign contact (via trigger on `campaign_contacts.sent_at`)
2. An email is logged in `email_logs` with a `campaign_contact_id` (via trigger)

### Follow-Up Sequence

1. **Initial Email Sent** → Follow-up state created with `next_followup_at = initial_email_sent_at + 48 hours`
2. **48 Hours Pass** → Follow-Up #1 sent (soft, friendly)
3. **4 Days Pass** → Follow-Up #2 sent (authority, value-driven)
4. **7 Days Pass** → Follow-Up #3 sent (short, direct)
5. **14 Days Pass** → Marked as cold lead, archived

### Reply Handling

When a contact replies:
1. Follow-up state is updated: `has_replied = true`, `status = stopped`
2. Reply intent is classified (hot, warm, not_interested, neutral)
3. Actions triggered based on intent:
   - **Hot** → Priority status, pin conversation
   - **Warm** → Auto-send thank you + booking link
   - **Not Interested** → Suppress, stop follow-ups

## Monitoring

### Check Follow-Up States

```sql
SELECT 
  rfs.*,
  cc.email,
  c.first_name,
  c.last_name
FROM roofing_followup_states rfs
JOIN campaign_contacts cc ON cc.id = rfs.campaign_contact_id
LEFT JOIN contacts c ON c.id = cc.contact_id
WHERE rfs.status = 'active'
ORDER BY rfs.next_followup_at ASC
LIMIT 20;
```

### Check Sent Messages

```sql
SELECT 
  rfm.*,
  cc.email
FROM roofing_followup_messages rfm
JOIN campaign_contacts cc ON cc.id = rfm.campaign_contact_id
WHERE rfm.status = 'sent'
ORDER BY rfm.sent_at DESC
LIMIT 20;
```

### Check Cold Leads

```sql
SELECT 
  rfs.*,
  cc.email,
  c.first_name
FROM roofing_followup_states rfs
JOIN campaign_contacts cc ON cc.id = rfs.campaign_contact_id
LEFT JOIN contacts c ON c.id = cc.contact_id
WHERE rfs.cold_lead = true
ORDER BY rfs.updated_at DESC
LIMIT 20;
```

## Customization

### Custom Templates

Workspaces can create custom templates:

```sql
INSERT INTO roofing_followup_templates (
  workspace_id,
  followup_step,
  template_name,
  subject,
  body,
  is_default,
  is_active
) VALUES (
  'workspace-uuid',
  1,
  'Custom Follow-Up #1',
  'Custom subject',
  'Custom body with {{first_name}}',
  true,
  true
);
```

### Adjust Timing

To change follow-up timing, update the calculation in the Edge Function:
- 48 hours → Change `interval '48 hours'` in `init_roofing_followup_state()`
- 4 days → Change day calculation in `processFollowUpSequence()`
- 7 days → Change day calculation in `processFollowUpSequence()`
- 14 days → Change day calculation in `archiveColdLeads()`

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

## Acceptance Criteria (V1)

✅ System automatically detects no-response after 48hr, 4day, 7day  
✅ Sends automated follow-up emails on schedule  
✅ Stops follow-ups immediately when homeowner replies  
✅ Auto-sends thank you + booking link for warm leads  
✅ Triggers priority status for hot leads  
✅ Moves not interested leads to unqualified bucket  
✅ Archives cold leads after 14 days  
✅ CRON executes reliably every hour  
✅ Actions respect plan limits + RLS  
✅ Suppression handling works correctly  

## Future Enhancements

- [ ] A/B testing for follow-up messages
- [ ] Analytics dashboard for follow-up performance
- [ ] Custom follow-up sequences per campaign
- [ ] SMS follow-ups for hot leads
- [ ] AI-generated personalized follow-ups
- [ ] Timezone-aware scheduling
- [ ] Reactivation flow for cold leads











































