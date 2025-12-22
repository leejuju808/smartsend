# Block 23360 — SmartSend Roofing Outreach Funnel v1

## Implementation Summary

**Mission:** Build the EXACT outreach machine to book demos and close roofing companies. This funnel ties directly into SmartSend's identity:
- We sell outcomes, not software
- We speak like roofers
- We keep it simple
- We focus on revenue, scheduling, chaos reduction
- We demonstrate value BEFORE the demo

## What Was Implemented

### 1. Database Schema ✅

**Migration:** `supabase/migrations/20250130000002_block23360_outreach_funnel_v1.sql`

**Core Table:**
- **`outreach_funnel_templates`** - Stores all outreach templates
  - `template_type` - master_script, email, facebook_dm, instagram_dm, linkedin_dm, followup_sequence, objection_killer, demo_push, silent_forge_targeting
  - `template_key` - Unique identifier (e.g., 'master_script', 'followup_1')
  - `subject_line` - For email templates
  - `message_body` - The actual template content
  - `sequence_step` - For follow-up sequences (1, 2, 3)
  - `delay_days` - Days to wait before sending
  - `objection_type` - For objection killers
  - `demo_push_step` - For demo push sequence
  - `is_binary_choice` - Force binary choice (today/tomorrow)
  - `variables` - Available template variables
  - `times_used` - Usage tracking
  - `is_active` - Enable/disable templates

**Features:**
- RLS policies for security
- Automatic updated_at triggers
- Indexes for performance
- Helper functions for easy template retrieval
- Seeded with all templates from Block 23360

### 2. Master Outreach Script ✅

**Template Key:** `master_script`

**Usage:** Universal first-touch message that works across email, DM, text, or cold call.

**Content:**
```
Hey [Name], quick question —

Are you open to something that would help your roofing company book homeowner jobs automatically and run them with less office chaos?

I built a new system that handles:
• Follow-up
• Scheduling
• Documents
• Payments
• Homeowner updates
• AI job insights

All in one place.

I'm looking for 5–10 roofing companies to test it privately.

Want to see a 5-minute demo?
```

**Why It Works:**
- Hits EVERY roofer pain point
- Short, outcome-based, and irresistible
- Use EXACTLY as written

### 3. Email Templates ✅

**Subject Lines:**
- `email_subject_1`: "Quick question about your roofing operations"
- `email_subject_2`: "A new system for roofing companies"
- `email_subject_3`: "Would this help your roofing business?"
- `email_subject_4`: "Something to make your roofing jobs easier?"

**Email Body:** `email_body_v1`

Perfect for roofers — simple, direct, and purely practical. Lists all value props:
- Books more homeowner jobs
- Handles all follow-up automatically
- Manages scheduling + crews
- Sends contracts + change orders
- Collects deposits
- Updates homeowners
- Prevents delays
- Catches margin issues
- Reduces office chaos

### 4. DM Templates ✅

**Facebook DM:** `facebook_dm_v1`
- Shorter than email
- Direct and to the point
- Mentions 5–10 early tester spots

**Instagram DM:** `instagram_dm_v1`
- Even shorter than Facebook
- Gets straight to the point
- Casual, friendly tone

**LinkedIn DM:** `linkedin_dm_v1`
- Slightly more professional tone
- For commercial roofers
- Mentions AI-based operating system

### 5. Follow-Up Sequence (3 Messages) ✅

**Follow-Up #1:** `followup_1`
- Delay: 1 day
- Message: "Just checking in — want to see how SmartSend books jobs + runs them automatically?"
- Short, direct, friendly

**Follow-Up #2:** `followup_2`
- Delay: 2-3 days after #1
- Message: Adds social proof ("Roofers testing SmartSend are seeing better scheduling + faster payments")
- Builds credibility

**Follow-Up #3:** `followup_3`
- Delay: 5 days after #2
- Message: Respectful opt-out option
- PROVEN to convert

### 6. Objection Killers ✅

**Too Busy:** `objection_too_busy`
- Response: "That's exactly when SmartSend helps the most. Let me show you how it removes 60% of the office work."
- Turns objection into value prop

**Has JobNimbus:** `objection_has_jobnimbus`
- Response: Positions SmartSend as complement, not replacement
- Focuses on what JobNimbus doesn't do
- SELL scheduling problems

**No AI:** `objection_no_ai`
- Response: Clarifies what AI means
- Focuses on practical outcomes, not buzzwords
- "AI that runs your jobs"

**Good Right Now:** `objection_good_right_now`
- Response: Acknowledges, then reframes the problem
- Makes them curious about lost opportunities
- Offers 5-minute preview

### 7. Demo Push System ✅

**Step 1:** `demo_push_step_1`
- Force binary choice: "Today or tomorrow?"
- NEVER ask "when works for you?"

**Step 2:** `demo_push_step_2`
- Narrow time: "Morning or afternoon?"

**Step 3:** `demo_push_step_3`
- Lock in time: "Cool — let's do [TIME]."
- Get email: "What email should I send the meeting link to?"

**Key Principle:** When roofer says "yes" or shows interest, IMMEDIATELY move to scheduling. Force binary choices. Never give open-ended options.

### 8. Silent Forge Targeting Script ✅

**Template Key:** `silent_forge_targeting`

**Content:**
```
I'm building a private beta group of 5–10 roofing companies to use SmartSend before the public launch.

You get:
• priority onboarding
• lifetime discounted pricing
• done-for-you setup
• direct access to the founder
• and we'll help run one of your jobs in the system

Want to see it?
```

**Why It Works:** Roofers LOVE exclusivity. This message gets EXCELLENT results.

### 9. Helper Functions ✅

**`get_outreach_template(template_key)`**
- Retrieves a specific template by key
- Returns full template object

**`get_followup_sequence()`**
- Returns all follow-up templates in order
- Includes step number, delay days, and message

**`get_objection_killer(objection_type)`**
- Retrieves objection killer by type
- Types: too_busy, has_jobnimbus, no_ai, good_right_now

**`get_demo_push_sequence()`**
- Returns all demo push steps in order
- Includes binary choice flags

### 10. Outreach Math (Hyper Realistic) ✅

**Conversion Funnel:**
- 100 cold messages → 20 replies (20% reply rate)
- 20 replies → 8 demos (40% demo booking rate)
- 8 demos → 3–5 beta customers (37.5–62.5% close rate)

**This is a NUMBERS GAME, not a luck game.**

The messaging IS GOOD ENOUGH to convert fast.

## Usage Examples

### Example 1: Send Master Script via Email

```sql
SELECT 
  subject_line,
  message_body
FROM outreach_funnel_templates
WHERE template_key = 'email_subject_1'
   OR template_key = 'email_body_v1';
```

### Example 2: Get Follow-Up Sequence

```sql
SELECT * FROM get_followup_sequence();
```

### Example 3: Handle Objection

```sql
SELECT message_body 
FROM get_objection_killer('too_busy');
```

### Example 4: Demo Push Flow

```sql
-- Step 1: Force binary choice
SELECT message_body FROM get_outreach_template('demo_push_step_1');

-- Step 2: Narrow time (if they pick "tomorrow")
SELECT message_body FROM get_outreach_template('demo_push_step_2');

-- Step 3: Lock in time (if they pick "afternoon")
SELECT message_body FROM get_outreach_template('demo_push_step_3');
```

## Integration Points

### 1. With Campaign System
- Use templates in `campaigns` table
- Link to `outreach_funnel_templates` via `template_key`
- Track usage via `times_used` counter

### 2. With Outbound Engine
- Integrate with `outbound_logs` table
- Use templates for `message` field
- Track engagement via existing outbound tracking

### 3. With Inbox System
- Use objection killers when replies come in
- Auto-detect objection type from reply
- Suggest appropriate response

### 4. With Demo Scheduling
- Use demo push system when interest detected
- Integrate with calendar scheduling
- Track demo bookings

## Next Steps

1. **Build UI Components**
   - Template selector in outreach composer
   - Follow-up sequence builder
   - Objection handler interface
   - Demo push workflow

2. **Add Analytics**
   - Track template performance
   - A/B test different templates
   - Measure conversion rates

3. **Automate Sequences**
   - Auto-send follow-ups based on delay_days
   - Auto-detect objections from replies
   - Auto-trigger demo push on interest

4. **Expand Templates**
   - Add more objection types
   - Create industry-specific variations
   - Build seasonal templates

## Final Statement

This outreach funnel:
- ✅ Books you demos DAILY
- ✅ Converts skeptical roofers
- ✅ Gets 5–10 paying customers fast
- ✅ Fills the private beta
- ✅ Creates your proof point
- ✅ Opens the door to $199 and $399/mo revenue
- ✅ Forces SmartSend into the real world
- ✅ Builds the starting revenue engine
- ✅ Makes SmartSend monetizable immediately

**This is how SmartSend enters real roofing companies BEFORE it launches publicly.**

**This funnel = Money + Proof + Momentum.**

---

**Block:** 23360  
**Status:** ✅ Complete  
**Date:** 2025-01-30







































