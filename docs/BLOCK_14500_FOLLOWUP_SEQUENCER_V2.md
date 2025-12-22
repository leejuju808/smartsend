# Block 14500 — SmartSend Follow-Up Sequencer v2

**The Behavior-Based Follow-Up Engine That Adjusts Timing, Messaging & Intensity Automatically**

## Overview

Block 14500 transforms SmartSend's follow-up system into a smart, behavior-driven engine that automatically:
- ✅ Adjusts follow-up timing based on lead score and message intelligence
- ✅ Adjusts number of follow-ups dynamically
- ✅ Changes tone based on intent and lead status
- ✅ Reacts to lead score (HOT/WARM/COLD)
- ✅ Reacts to message intelligence (storm, insurance, repair signals)
- ✅ Stops when necessary (safe-stop logic)
- ✅ Escalates when needed (HOT leads get faster follow-ups)
- ✅ Pauses safely (respects unsubscribes, bounces, complaints)
- ✅ Logs everything (full audit trail)

## Why Roofers Will Love This

🔥 **1. Follow-up becomes fully automatic** - No human effort required.

🔥 **2. HOT leads get fast attention** - This directly boosts revenue.

🔥 **3. Cold leads get gentle nudging** - Without annoying homeowners.

🔥 **4. Insurance & storm leads get the RIGHT messages** - Huge value add for contractors.

🔥 **5. Makes SmartSend feel "alive"** - It reacts to every signal automatically.

🔥 **6. Roofers close more jobs** - This feature alone makes SmartSend worth the subscription.

## Architecture

### Database Schema

#### `followup_schedule` Table
Tracks scheduled follow-ups for each contact:
- `contact_id` - The contact to follow up with
- `next_followup_at` - When to send the follow-up
- `followup_step` - Which step in the sequence (1, 2, 3, etc.)
- `template_type` - Type of template to use (light, direct, urgent, storm, insurance, repair, homeowner_objection)
- `tone` - Tone to use (urgent, friendly, soft, storm, insurance)
- `reason` - Why this follow-up was scheduled
- `lead_score` - Lead score at time of scheduling
- `message_intelligence` - Latest message intelligence data
- `status` - pending, sent, cancelled, paused, stopped

#### `followup_templates` Table
Stores follow-up email templates:
- `template_type` - Type of template (light, direct, urgent, storm, insurance, repair, homeowner_objection)
- `subject` - Email subject line
- `body` - Email body (supports variables like {{first_name}}, {{city}})
- `is_default` - Whether this is a default template
- `workspace_id` - Optional workspace-specific templates

### Core Functions

#### `calculate_next_followup_date(contact_id, lead_score, message_intelligence, last_message_at, current_step)`
Calculates the next follow-up date using dynamic timing rules:

**HOT leads (70+):**
- Step 1: Next day
- Step 2: 2 days later
- Step 3: 3 days later
- Step 4: 5 days later

**WARM leads (30-69):**
- Step 1: After 3 days
- Step 2: 5 days later
- Step 3: 7 days later

**COLD leads (0-29):**
- Step 1: After 5 days
- Step 2: 10 days later

**Insurance Leads:**
- Step 1: Tomorrow
- Step 2: 2 days later
- Step 3: 4 days later

**Storm Damage Leads:**
- Step 1: 24-48 hours
- Step 2: 3 days later
- Step 3: 5 days later

#### `determine_followup_template(contact_id, lead_score, message_intelligence, current_step, reason)`
Determines which template type and tone to use based on:
- Lead score
- Message intelligence categories (storm, insurance, repair)
- Current step number
- Reason for follow-up

**Template Selection Priority:**
1. Storm indicators → `storm` template
2. Insurance indicators → `insurance` template
3. Repair signals → `repair` template
4. Step-based (1=light, 2=direct, 3+=urgent)
5. Score-based fallback

#### `should_stop_followups(contact_id)`
Checks safe-stop conditions:
- ✅ Homeowner replied (within 24 hours)
- ✅ Status moved to HOT (roofer should handle)
- ✅ Status moved to NOT INTERESTED
- ✅ Unsubscribed
- ✅ Suppressed
- ✅ Bounce detected (placeholder - implement based on your bounce tracking)

#### `calculate_next_followup(contact_id)`
Main sequencer function that:
1. Gets contact info (lead score, status, tags)
2. Checks safe-stop conditions
3. Gets latest message intelligence
4. Determines reason for follow-up
5. Calculates next follow-up date
6. Determines template type and tone
7. Returns complete follow-up plan

#### `schedule_followup(contact_id)`
Schedules a follow-up for a contact:
1. Calls `calculate_next_followup` to get the plan
2. Cancels any existing pending follow-ups
3. Inserts new schedule record

#### `send_followup(schedule_id)`
Sends a scheduled follow-up:
1. Validates schedule is pending
2. Double-checks safe-stop conditions
3. Gets template content
4. Gets contact info
5. **TODO: Actually send email** (placeholder - integrate with your email service)
6. Marks as sent
7. Triggers next follow-up scheduling

#### `run_behavior_sequencer()`
Main worker function that:
1. Finds all due follow-ups (`next_followup_at <= now()`)
2. Processes them in batches (limit 100)
3. Sends each follow-up
4. Schedules next follow-up for each contact
5. Returns statistics (sent, stopped, errors)

### Edge Function

#### `followup-sequencer-v2` (Supabase Edge Function)
Runs hourly via cron job to:
1. Call `run_behavior_sequencer()` to process due follow-ups
2. Schedule new follow-ups for contacts that need them:
   - Contacts with recently sent follow-ups (schedule next step)
   - Contacts with recent activity (initial follow-up)
   - Contacts with lead_score > 0 but no pending follow-up

**Cron Schedule:** Every hour (`0 * * * *`)

## Follow-Up Triggers

SmartSend automatically triggers follow-ups when:

1. **No reply after X days** (default = 2 days)
   - Sequencer starts next step

2. **Warm reply without clear booking**
   - Message intelligence = WARM → follow-up in 1–2 days

3. **Lead Score = 30–69 (WARM)**
   - Follow-up = gentle

4. **Lead Score = 70+ (HOT)**
   - Follow-up = faster & more direct

5. **Storm or Insurance Indicators**
   - Follow-up becomes priority:
     - Faster timing
     - More urgent wording
     - Shorter delay

6. **Appointment not confirmed**
   - If homeowner asks about availability but roofer doesn't respond
   - Follow-up reminder is auto-created

7. **High-Value Leads (Replacement / Insurance)**
   - Follow-up cadence optimized:
     - Day 1
     - Day 3
     - Day 6
     - Day 10

## Follow-Up Templates

### Default Templates Included:

1. **Follow-Up 1 (Light)**
   - Subject: "Quick check-in"
   - Body: "Hey {{first_name}}, circling back real quick — want me to take a look at the roof?"

2. **Follow-Up 2 (Direct)**
   - Subject: "Still interested?"
   - Body: "Still want me to check your roof or should I close this out?"

3. **Follow-Up 3 (Urgent)**
   - Subject: "Last follow-up"
   - Body: "Last follow-up from me — want me to stop by this week?"

4. **Follow-Up 4 (Storm)**
   - Subject: "Storm damage check"
   - Body: "With the recent storm in {{city}}, any damage you want checked?"

5. **Follow-Up 5 (Insurance)**
   - Subject: "Insurance claim help"
   - Body: "If you're doing a claim, I can check the roof before the adjuster comes by."

6. **Follow-Up 6 (Repair)**
   - Subject: "Repair check"
   - Body: "Any leaking or missing shingles since we last talked?"

7. **Follow-Up 7 (Homeowner Objection)**
   - Subject: "No pressure"
   - Body: "No worries—happy to help whenever you're ready."

## Tone Adjustment

Follow-up tone changes depending on the situation:

**Urgent → HOT lead / insurance:**
- Short, direct: "Just checking in — want me to come take a look this week?"

**Friendly → Warm lead:**
- Casual: "Wanted to circle back. Do you still want me to check the roof?"

**Soft → Cold lead:**
- No pressure: "No worries if not — just wanted to follow up in case you were still thinking about it."

**Storm angle:**
- Local relevance: "With that hail last week, want me to take a quick look at the roof?"

**Insurance angle:**
- Guidance: "If you're going through a claim, I can help check the roof before the adjuster comes."

## Safe-Stop Logic

Follow-ups STOP when:
- ✅ Homeowner replies
- ✅ Status moves to HOT
- ✅ Status moves to NOT INTERESTED
- ✅ Unsubscribed
- ✅ Bounce detected
- ✅ Complaint detected
- ✅ Campaign paused by safety engine

SmartSend MUST be polite but powerful.

## Integration Points

### Email Sending Integration

The `send_followup()` function includes a TODO for email sending integration. To complete the implementation:

1. **Replace template variables** in subject and body:
   - `{{first_name}}` → Contact's first name
   - `{{city}}` → Contact's city
   - `{{your_name}}` → Roofer's name (from workspace settings)

2. **Call your email sending service:**
   - Option A: Use `src/lib/mailer.ts` → `sendMail()` function
   - Option B: Use `src/server/email.ts` → `sendEmail()` function
   - Option C: Use `src/app/api/send/route.ts` → POST endpoint
   - Option D: Use Resend API directly
   - Option E: Use Gmail API directly

3. **Log the sent email:**
   - Insert into `email_messages` or `inbox_messages` table
   - Include thread_id if replying to existing thread
   - Track message_id for reply matching

4. **Handle errors:**
   - Mark schedule as `failed` if send fails
   - Implement retry logic if needed
   - Log errors for debugging

### Example Integration Code

```typescript
// In send_followup function, replace TODO section with:

// Replace template variables
let subject = v_template_record.subject;
let body = v_template_record.body;

subject = subject.replace(/\{\{first_name\}\}/g, v_contact_record.first_name || 'there');
subject = subject.replace(/\{\{city\}\}/g, v_contact_record.city || 'your area');
body = body.replace(/\{\{first_name\}\}/g, v_contact_record.first_name || 'there');
body = body.replace(/\{\{city\}\}/g, v_contact_record.city || 'your area');

// Get workspace sender info
const { data: workspace } = await supabase
  .from('workspaces')
  .select('name, default_from_email')
  .eq('id', v_schedule_record.workspace_id)
  .single();

// Send email (example using your email service)
const { sendMail } = await import('@/lib/mailer');
const result = await sendMail({
  from: workspace.default_from_email || 'noreply@smartsend.ai',
  to: v_contact_record.email,
  subject: subject,
  html: body,
  text: body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
});

// Log sent email
await supabase.from('email_messages').insert({
  contact_id: v_schedule_record.contact_id,
  workspace_id: v_schedule_record.workspace_id,
  subject: subject,
  body_html: body,
  body_text: body.replace(/<[^>]*>/g, ''),
  direction: 'out',
  sent_at: now(),
  provider_message_id: result.messageId,
});
```

## Usage

### Manual Scheduling

To manually schedule a follow-up for a contact:

```sql
SELECT public.schedule_followup('contact-uuid-here');
```

### Manual Processing

To manually process due follow-ups:

```sql
SELECT public.run_behavior_sequencer();
```

### View Scheduled Follow-Ups

```sql
SELECT 
  fs.*,
  c.email,
  c.first_name,
  c.lead_score,
  ft.name as template_name
FROM public.followup_schedule fs
JOIN public.contacts c ON c.id = fs.contact_id
LEFT JOIN public.followup_templates ft ON ft.id = fs.template_id
WHERE fs.status = 'pending'
ORDER BY fs.next_followup_at ASC;
```

### Cancel a Follow-Up

```sql
UPDATE public.followup_schedule
SET status = 'cancelled'
WHERE contact_id = 'contact-uuid-here'
  AND status = 'pending';
```

## Monitoring

### Check Sequencer Performance

```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM public.followup_schedule
GROUP BY status;
```

### View Recent Activity

```sql
SELECT 
  fs.*,
  c.email,
  c.first_name,
  c.lead_score
FROM public.followup_schedule fs
JOIN public.contacts c ON c.id = fs.contact_id
WHERE fs.updated_at > now() - interval '24 hours'
ORDER BY fs.updated_at DESC
LIMIT 50;
```

## Next Steps

1. **Complete Email Integration** - Implement actual email sending in `send_followup()` function
2. **Add Template Variables** - Expand template variable support ({{your_name}}, {{company}}, etc.)
3. **Add Workspace-Specific Templates** - Allow roofers to customize templates per workspace
4. **Add Analytics** - Track open rates, click rates, reply rates for follow-ups
5. **Add A/B Testing** - Test different templates and timing strategies
6. **Add Manual Override** - Allow roofers to manually schedule/cancel follow-ups from UI
7. **Add Notifications** - Notify roofers when HOT leads are identified or when follow-ups are stopped

## Files Created

1. **Migration:** `supabase/migrations/20250130000001_block_14500_followup_sequencer_v2.sql`
   - Creates `followup_schedule` table
   - Creates `followup_templates` table
   - Creates all sequencer functions
   - Inserts default templates

2. **Edge Function:** `supabase/functions/followup-sequencer-v2/index.ts`
   - Processes due follow-ups hourly
   - Schedules new follow-ups for contacts that need them

3. **Cron Configuration:** `supabase/config.toml`
   - Added cron job to run sequencer every hour

4. **Documentation:** `docs/BLOCK_14500_FOLLOWUP_SEQUENCER_V2.md`
   - Complete implementation guide
   - Usage examples
   - Integration instructions

## Testing

To test the sequencer:

1. **Create a test contact:**
```sql
INSERT INTO public.contacts (workspace_id, email, first_name, lead_score)
VALUES ('workspace-uuid', 'test@example.com', 'Test', 50);
```

2. **Schedule a follow-up:**
```sql
SELECT public.schedule_followup('contact-uuid');
```

3. **Check scheduled follow-up:**
```sql
SELECT * FROM public.followup_schedule WHERE contact_id = 'contact-uuid';
```

4. **Manually trigger sequencer:**
```sql
SELECT public.run_behavior_sequencer();
```

5. **Verify follow-up was sent:**
```sql
SELECT * FROM public.followup_schedule WHERE contact_id = 'contact-uuid' AND status = 'sent';
```

## Support

For questions or issues, refer to:
- Block 13800 (Lead Score Engine) - For lead scoring logic
- Block 14300 (Message Intelligence) - For message intelligence categories
- Block 10600 (Follow-Up Brain v1) - For related follow-up functionality





















































