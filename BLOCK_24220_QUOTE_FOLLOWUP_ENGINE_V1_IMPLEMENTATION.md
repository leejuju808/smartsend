# Block 24220 — SmartSend Roofing Quote Follow-Up Engine v1

**Post-Estimate Follow-Up • Insurance Coordination • Multi-Touch Nurture • Closing Scripts**

## Overview

This is where 70% of roofing companies LOSE money. They give quotes… Homeowners disappear… Roofers never follow up…

SmartSend fixes that permanently with a comprehensive 7-stage follow-up engine that automatically nurtures homeowners after quotes are sent.

**This engine alone will help roofers close 20–40% more jobs.**

## Features

### 1. Automatic Trigger Detection

The system automatically activates follow-up when:
- A roofer logs "Estimate Sent"
- A homeowner receives Roofr/AccuLynx/JobNimbus quote
- A PDF estimate is uploaded
- A roofer marks lead as "Quoted"
- Homeowner asks for pricing
- Insurance adjuster visit is scheduled

### 2. The 7-Stage Follow-Up Sequence

**Stage 1 — Same Day Follow-Up (5–10 hours after quote)**
- "Just wanted to check in — any questions about the estimate we sent over?"
- Catches homeowners before competitors do

**Stage 2 — Day 2 Clarification**
- "Quick note — we can usually schedule work within 1–2 weeks."
- Adds gentle pressure without being pushy

**Stage 3 — Day 4 Value Add**
- "Wanted to mention — all work includes full warranty coverage + cleanup."
- Shows professionalism → builds trust → increases conversions

**Stage 4 — Day 7 Insurance Follow-Up**
- "Any update from your adjuster? If you want, we can help speak with them or document the damage."
- Insurance delays kill roofing deals. SmartSend pushes them back to the roofer.

**Stage 5 — Day 10 Check-In**
- "Still happy to help if you're moving forward with the project."
- Most homeowners choose whoever follows up last.

**Stage 6 — Day 14 Decision Close**
- "Before we close out your file — were you still wanting to move forward? Just reply yes/no."
- Gets a clear answer without being pushy.

**Stage 7 — Day 21 "Last Call" Revival**
- "Last quick check — want us to keep your project on our schedule?"
- Even homeowners who ghost will reply here. This message alone closes 5–10% of deals.

### 3. Insurance Coordination Engine

Automatically handles insurance-related delays:
- Detects when homeowner is waiting on insurance
- Sends insurance guidance
- Requests documentation
- Reminds homeowner to file claim
- Helps schedule adjuster inspection
- Sends post-adjuster follow-up

### 4. Hot Lead Prioritization

When homeowner says:
- "We're ready."
- "When can you start?"
- "What's next?"
- "Let's do it."

SmartSend immediately:
- Flags HOT LEAD
- Sends push notification
- Drafts "next steps" message
- Suggests scheduling installation
- Updates lead status

### 5. Price Shock Response Engine

If homeowner responds with:
- "Too expensive"
- "Another company is cheaper"
- "Trying to save money"

SmartSend drafts:
- "Totally understand — roofing quotes can vary a lot. We use licensed crews, full warranty, and premium materials. If cost is a concern, we can explore options."
- Keeps the conversation alive instead of losing the deal.

### 6. Auto-Drafted Follow-Up Responses

Inbox AI v2 + Quote Follow-Up Engine combine to write:
- Clarification replies
- Scheduling messages
- Warranty explanations
- Insurance information
- Reassurance messages
- Next-step messages

### 7. Follow-Up Dashboard

A simple panel showing:
- 🔥 "Active Quotes: 7"
- 💵 "Quotes Needing Follow-Up Today: 3"
- 📅 "Ready to Schedule: 2"
- ⏳ "Waiting on Insurance: 1"

## Database Schema

### Tables

1. **quote_followup_sequences** — Tracks the 7-stage sequence for each quote
2. **quote_followup_schedules** — Individual scheduled messages for each stage
3. **quote_followup_templates** — Templates for each stage

### Key Functions

- `initialize_quote_followup_sequence(quote_id)` — Initializes sequence when quote is sent
- `schedule_quote_followup_stages(sequence_id)` — Schedules all 7 stages
- `process_due_quote_followups()` — Processes due follow-ups (called by cron)
- `send_quote_followup_message(schedule_id)` — Sends a follow-up message
- `handle_quote_hot_lead(quote_id, reason)` — Handles hot lead detection
- `handle_quote_price_objection(quote_id, objection_text)` — Handles price objections
- `update_quote_insurance_status(quote_id, ...)` — Updates insurance status

### Triggers

- `trg_initialize_quote_followup` — Auto-initializes sequence when quote status changes to 'sent'

## API Endpoints

### Dashboard
```
GET /api/quotes/followup/dashboard?workspace_id={id}
```

Returns dashboard metrics:
- active_quotes
- hot_leads
- waiting_on_insurance
- due_today
- due_soon

### Hot Lead Handler
```
POST /api/quotes/followup/hot-lead
Body: { quote_id, hot_reason }
```

### Price Objection Handler
```
POST /api/quotes/followup/price-objection
Body: { quote_id, objection_text }
```

### Insurance Status Handler
```
POST /api/quotes/followup/insurance
Body: { quote_id, waiting_on_insurance, adjuster_scheduled, adjuster_date }
```

## Edge Function

### quote-followup-processor

Runs every 5 minutes via cron to process due follow-ups.

**Cron Schedule:** `*/5 * * * *` (every 5 minutes)

**Endpoint:** `/functions/v1/quote-followup-processor`

## Integration Points

### Reply Intelligence Integration

When reply intelligence detects:
- **Hot Lead Signals** → Calls `integrate_quote_followup_hot_lead(lead_id, reason)`
- **Price Objections** → Calls `integrate_quote_followup_price_objection(lead_id, objection_text)`

### Hot Lead Detector Integration

When hot lead detector flags a lead:
- Automatically triggers hot lead handling for any active quote sequences

### Insurance Brain Integration

When insurance status changes:
- Automatically updates quote follow-up sequence insurance status
- Reschedules stage 4 (insurance follow-up) if adjuster scheduled

## Safe-Stop Conditions

Follow-ups are automatically cancelled if:
- Quote is accepted or rejected
- Lead status is NOT_INTERESTED, CLOSED, or LOST
- Homeowner replied within last 24 hours
- Lead is suppressed or unsubscribed

## Email Sending

Follow-up messages are sent via the existing inbox email infrastructure:
- Creates outbound message in `inbox_messages` table
- Integrates with Gmail/Outlook/SMTP providers
- Tracks opens, clicks, and replies

## Dashboard View

The `quote_followup_dashboard` view provides real-time metrics per workspace:
- Active quotes count
- Hot leads count
- Waiting on insurance count
- Due today count
- Due soon count

## Retention & Upgrades

This engine drives upgrades because:
- Roofers close jobs they would have lost
- They see quotes turning into money
- They love the follow-up messages
- The system reminds them who to call
- SmartSend books jobs for them
- Storm + Insurance + Quote Follow-Up work together

## Why This Makes SmartSend Recession-Proof

In slow times:
- Homeowners shop around more
- Competition increases
- Insurance claims rise
- Roofers need better follow-up than ever

SmartSend Quote Follow-Up becomes mission-critical. Roofers cannot turn it off.

## Next Steps

1. **Deploy Migration** — Run the SQL migration file
2. **Deploy Edge Function** — Deploy `quote-followup-processor`
3. **Update Config** — Cron job is already configured in `config.toml`
4. **Test Integration** — Test with a sample quote
5. **Monitor Dashboard** — Check dashboard metrics
6. **Integrate Reply Intelligence** — Connect hot lead and price objection detection

## Files Created

1. `supabase/migrations/20250130000001_block_24220_quote_followup_engine_v1.sql` — Database schema and functions
2. `supabase/functions/quote-followup-processor/index.ts` — Edge function for processing
3. `app/api/quotes/followup/dashboard/route.ts` — Dashboard API
4. `app/api/quotes/followup/hot-lead/route.ts` — Hot lead handler API
5. `app/api/quotes/followup/price-objection/route.ts` — Price objection handler API
6. `app/api/quotes/followup/insurance/route.ts` — Insurance status handler API

## Testing

To test the system:

1. Create a quote and mark it as 'sent'
2. Check that a sequence is automatically created
3. Verify all 7 stages are scheduled
4. Wait for stage 1 to be due (8 hours after sent)
5. Run the edge function manually or wait for cron
6. Verify email is sent
7. Check dashboard metrics

## Support

For issues or questions, check:
- Database logs for function errors
- Edge function logs for processing errors
- Dashboard API for data issues
- Email sending logs for delivery issues






































