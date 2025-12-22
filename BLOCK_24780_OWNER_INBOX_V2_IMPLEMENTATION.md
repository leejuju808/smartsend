# Block 24780 — SmartSend Roofing Owner Inbox v2 Implementation

## Overview
The Owner Inbox v2 is a CEO-level command module that gives roofing owners a private, high-level inbox that cuts out noise and ONLY surfaces:
- Problems
- Risks
- Opportunities
- Money alerts
- Staffing issues
- Supplier failures
- Jobs at risk
- Customer escalations

This is NOT the normal inbox. This is the CEO View of SmartSend.

## Implementation Summary

### ✅ Database Schema
**File:** `supabase/migrations/20250131000001_block24780_owner_inbox_v2.sql`

#### Core Tables Created:
1. **`owner_inbox_items`** - Stores high-impact items that need owner attention
   - `message_type`: financial_alert, job_risk_alert, crew_problem, supplier_problem, high_value_opportunity, leadership_decision_needed
   - `priority`: critical, high, medium, low
   - `status`: new, acknowledged, resolved, dismissed
   - Related entity links: job_id, lead_id, crew_id, supplier_id, invoice_id, payment_id
   - Action metadata: action_type, action_url
   - Timestamps: created_at, updated_at, escalated_at

#### Database Functions Created:

1. **`escalate_to_owner_inbox()`** - Generic function to escalate items to owner inbox
   - Prevents duplicates
   - Auto-updates priority if item already exists

2. **`check_financial_alerts()`** - Detects financial alerts:
   - Final invoice overdue > 7 days
   - Deposit not collected - job should NOT start
   - Insurance depreciation stalled > 12 days
   - Supplement rejected

3. **`check_job_risk_alerts()`** - Detects job risk alerts:
   - Delivery delayed - crew will be idle
   - Homeowner unhappy - review risk (health score < 50)
   - Crew reporting decking issues - cost change expected

4. **`check_crew_problems()`** - Detects crew problems:
   - Crew late 3 days in a row
   - Crew cleanup complaints from homeowner
   - Crew uploaded no documentation today

5. **`check_supplier_problems()`** - Detects supplier problems:
   - Supplier late 2/3 deliveries this week
   - Material mismatch caused delay

6. **`check_high_value_opportunities()`** - Detects opportunities:
   - 3 approved jobs not scheduled - stuck revenue
   - 5 hot leads from yesterday - no inspection scheduled

7. **`check_leadership_decisions()`** - Detects situations requiring owner decisions:
   - Homeowner refusing deductible - escalate
   - Insurance not approving supplement - needs owner call

8. **`run_owner_inbox_escalation_engine()`** - Main function that runs all escalation checks
   - Can run for specific workspace or all workspaces

9. **`get_owner_inbox_digest()`** - Returns digest data for daily email
   - Critical issues
   - High priority items
   - Opportunities
   - Financial overview

### ✅ API Routes
**Files:**
- `app/api/owner-inbox/route.ts` - GET inbox items, PATCH update items
- `app/api/owner-inbox/digest/route.ts` - GET digest data
- `app/api/owner-inbox/escalate/route.ts` - POST trigger escalation engine

**Features:**
- Workspace-scoped access control
- Owner-only access enforcement
- Filtering by priority and message type
- Action handling (resolve, dismiss, acknowledge)

### ✅ Frontend Components
**File:** `app/(dashboard)/owner-inbox/page.tsx`

**Features:**
- Priority summary cards (Critical, High, Medium, Low)
- Filter tabs by priority
- Message type filters
- Item cards with:
  - Priority badges (color-coded)
  - Message type icons
  - Related entity info (job, crew, supplier, lead)
  - Action buttons (deep links to relevant views)
  - Resolve/Dismiss buttons
- Real-time refresh every 30 seconds
- Empty state when no items

### ✅ Daily Digest Email
**File:** `supabase/functions/owner-inbox-daily-digest/index.ts`

**Features:**
- Sends daily digest at 6AM UTC
- Includes:
  - Critical issues count and list
  - High-priority items count and list
  - Opportunities count and list
  - Financial overview (collected this week, outstanding, jobs scheduled today)
- Beautiful HTML email template
- Link to Owner Inbox dashboard

### ✅ Escalation Engine Cron Job
**File:** `supabase/functions/owner-inbox-escalation-engine/index.ts`

**Features:**
- Runs every 30 minutes
- Checks all workspaces for new escalations
- Automatically creates owner inbox items based on escalation rules

### ✅ Cron Configuration
**File:** `supabase/functions/_scheduled/cron.yaml`

**Scheduled Jobs:**
- `owner-inbox-daily-digest`: Daily at 6 AM UTC
- `owner-inbox-escalation-engine`: Every 30 minutes

## Escalation Rules

### Financial Alerts
- ✅ Final invoice overdue > 7 days → HIGH priority
- ✅ Deposit not collected + job scheduled to start → CRITICAL priority
- ✅ Insurance depreciation stalled > 12 days → HIGH priority
- ✅ Supplement rejected → HIGH priority

### Job Risk Alerts
- ✅ Delivery delayed + crew scheduled soon → CRITICAL priority
- ✅ Job health score < 50 → HIGH priority
- ✅ Crew reporting decking issues → HIGH priority

### Crew Problems
- ✅ Crew late 3 days in a row → HIGH priority
- ✅ Crew cleanup complaints → MEDIUM priority
- ✅ Crew uploaded no documentation today → LOW priority

### Supplier Problems
- ✅ Supplier late 2/3 deliveries this week → HIGH priority
- ✅ Material mismatch caused delay → MEDIUM priority

### High-Value Opportunities
- ✅ 3 approved jobs not scheduled → HIGH priority
- ✅ 5 hot leads from yesterday → MEDIUM priority

### Leadership Decisions Needed
- ✅ Homeowner refusing deductible → HIGH priority
- ✅ Insurance not approving supplement → HIGH priority

## Priority Levels

- 🔴 **CRITICAL** - "Needs action now" (red)
- 🟠 **HIGH** - "Action today" (orange)
- 🟡 **MEDIUM** - "Monitor or assign" (yellow)
- 🟢 **LOW** - "FYI only" (green)

## Message Types

1. **Financial Alert** - Money-related issues
2. **Job Risk Alert** - Jobs at risk
3. **Crew Problem** - Crew performance issues
4. **Supplier Problem** - Supplier reliability issues
5. **High-Value Opportunity** - Revenue opportunities
6. **Leadership Decision Needed** - Owner-level decisions

## Action Types

- `assign_to_manager` - Assign to manager
- `call_homeowner` - Call homeowner
- `message_crew_lead` - Message crew lead
- `contact_supplier` - Contact supplier
- `resolve_and_watch` - Resolve & watch
- `create_task` - Create task

## Integration Points

### Deep Links
- Job issues → `/jobs/{job_id}`
- Payment issues → `/jobs/{job_id}/payments`
- Insurance issues → `/jobs/{job_id}/insurance`
- Material issues → `/jobs/{job_id}/materials`
- Crew issues → `/crews/{crew_id}`
- Supplier issues → `/suppliers/{supplier_id}`

### Related Systems
- Payment Status Engine (Block 24460)
- Job Health Scores (Block 24420)
- Crew Assignment System (Block 24380)
- Supplier Reliability Scoring (Block 22465)
- Ops Dashboard (Block 24740)

## Usage

### For Owners
1. Navigate to `/owner-inbox`
2. View high-priority escalations
3. Filter by priority or message type
4. Click action buttons to navigate to relevant views
5. Resolve or dismiss items as needed

### For System
1. Escalation engine runs automatically every 30 minutes
2. Daily digest emails sent at 6 AM UTC
3. Items automatically created based on escalation rules
4. Duplicate prevention ensures no spam

## Benefits

### For Roofing Owners
- ✔ Clarity - See only what matters
- ✔ Control - Know exactly what needs attention
- ✔ Confidence - Stay ahead of crises
- ✔ Less stress - No noise, just actionable items
- ✔ Faster decisions - Direct links to problems
- ✔ Fewer surprises - Early warning system
- ✔ Higher revenue - Catch opportunities fast

### For SmartSend Retention
- Roofers will NEVER cancel SmartSend when:
  - It protects them from surprises
  - It shows revenue threats
  - It shows job risks
  - It manages crew and supplier problems
  - It alerts them before disasters
  - It saves hours of daily stress
  - It replaces 5 different systems

This becomes the owner's daily mission-control tool. Canceling SmartSend = flying blind. Roofers won't do it.

## Next Steps

1. Deploy database migration
2. Deploy edge functions
3. Update cron configuration
4. Test escalation engine
5. Test daily digest emails
6. Monitor owner inbox usage
7. Gather feedback and iterate






































