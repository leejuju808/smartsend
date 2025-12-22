# Block 25620 — SmartSend Roofing Notifications & Alerts v1 Implementation

## Overview

Successfully implemented Block 25620 - SmartSend Roofing Notifications & Alerts v1, upgrading SmartSend into a live intelligence system that watches EVERY part of the roofing company and alerts the right person at the right time.

## What Was Built

### 1. Database Schema Extensions ✅

**File:** `supabase/migrations/20250230000001_block25620_roofing_alerts_intelligence_v1.sql`

#### Extended Notifications Table
- Added `risk_score` (0-100) - Risk score indicating severity
- Added `alert_context` (JSONB) - Additional context data about the alert
- Added `requires_action` (boolean) - Whether alert requires immediate action
- Added `action_taken` (boolean) - Whether action has been taken
- Added `action_taken_at` (timestamptz) - When action was taken
- Added `action_taken_by` (uuid) - Who took the action

#### New Alert Intelligence Table
- `alert_intelligence` - Stores intelligence about alerts, risk factors, and alert patterns
- Tracks risk factors, recommended actions, predicted impact, confidence scores
- Supports resolution tracking

### 2. Lead & Sales Alert Functions ✅

#### A) New Lead Alert
- **Function:** `alert_new_lead()`
- **Trigger:** Instant ping when new lead created
- **Priority:** CRITICAL
- **Recipients:** Owner + Sales Reps
- **Delivery:** Push + SMS + In-App

#### B) Lead Not Contacted Alert (15 minutes)
- **Function:** `alert_lead_not_contacted()`
- **Trigger:** 15+ minutes since lead created without contact
- **Priority:** CRITICAL
- **Recipients:** Sales Reps
- **Message:** "Contact lead NOW for highest close rate"

#### C) Quote Viewed Alert
- **Function:** `alert_quote_viewed()`
- **Trigger:** Homeowner opens quote
- **Priority:** IMPORTANT
- **Recipients:** Sales Reps
- **Message:** "Homeowner opened quote X minutes ago. Follow up now."

#### D) Hot Lead Behavior Alert
- **Function:** `alert_hot_lead_behavior()`
- **Trigger:** Strong intent signals detected (clicks, replies, repeats)
- **Priority:** CRITICAL
- **Recipients:** Owner + Sales Reps
- **Message:** "This lead is heating up. Contact immediately."

### 3. Job Risk Alert Functions (Roofing-Specific AI) ✅

#### A) Weather Risk High Alert
- **Function:** `alert_weather_risk_high()`
- **Trigger:** Rain/wind/storm expected during job
- **Priority:** CRITICAL/IMPORTANT
- **Recipients:** Owner + Ops Managers + Crew Leads
- **Message:** "Rain expected at 1 PM — consider rescheduling."

#### B) Material Not Confirmed Alert
- **Function:** `alert_material_not_confirmed()`
- **Trigger:** PO not confirmed within 2 days of install
- **Priority:** CRITICAL
- **Recipients:** Owner + Ops Managers
- **Message:** "PO not confirmed — install at risk."

#### C) Crew Not Checked In Alert
- **Function:** `alert_crew_not_checked_in()`
- **Trigger:** Crew late for scheduled start
- **Priority:** IMPORTANT
- **Recipients:** Owner + Ops Managers
- **Message:** "Crew is late — install start delayed."

#### D) Missing Cleanup Photos Alert
- **Function:** `alert_missing_cleanup_photos()`
- **Trigger:** Job marked complete but cleanup photos missing
- **Priority:** IMPORTANT
- **Recipients:** Owner + Ops Managers
- **Message:** "Crew marked job complete but cleanup photos missing."

#### E) Permit Not Uploaded Alert
- **Function:** `alert_permit_not_uploaded()`
- **Trigger:** Job scheduled without permit documentation
- **Priority:** CRITICAL (Red Bar)
- **Recipients:** Owner + Ops Managers
- **Message:** "Job cannot proceed without permit documentation."

#### F) Labor Hours Exceed Target Alert
- **Function:** `alert_labor_hours_exceed_target()`
- **Trigger:** Actual hours exceed target by 10%+
- **Priority:** IMPORTANT
- **Recipients:** Owner + Ops Managers
- **Message:** "Crew labor cost rising — job margin shrinking."

### 4. Material & Supplier Alert Functions ✅

#### A) Material Shortage Alert
- **Function:** `alert_material_shortage()`
- **Trigger:** Missing items detected in delivery
- **Priority:** CRITICAL
- **Recipients:** Owner + Ops Managers
- **Message:** Lists missing items

#### B) Wrong Color Delivered Alert
- **Function:** `alert_wrong_color_delivered()`
- **Trigger:** Wrong shingle color delivered
- **Priority:** CRITICAL
- **Recipients:** Owner + Ops Managers
- **Message:** "Expected: X, Delivered: Y"

#### C) Supplier Delayed Alert
- **Function:** `alert_supplier_delayed()`
- **Trigger:** Delivery delayed past original ETA
- **Priority:** CRITICAL
- **Recipients:** Owner + Ops Managers
- **Message:** "Supplier X is Y days late"

#### D) Dumpster Not Delivered Alert
- **Function:** `alert_dumpster_not_delivered()`
- **Trigger:** Dumpster not delivered by expected date
- **Priority:** IMPORTANT
- **Recipients:** Owner + Ops Managers

### 5. Crew Alert Functions ✅

#### A) Crew Briefing Alert
- **Function:** `alert_crew_briefing()`
- **Trigger:** Tomorrow's job briefing sent to crew leads
- **Priority:** STANDARD
- **Recipients:** Crew Leads
- **Includes:** Weather warnings, material status, special instructions

#### B) Crew Behind Schedule Alert
- **Function:** `alert_crew_behind_schedule()`
- **Trigger:** Crew progress below expected
- **Priority:** IMPORTANT
- **Recipients:** Owner + Ops Managers
- **Message:** Shows expected vs actual progress

### 6. Payment Alert Functions ✅

#### A) Homeowner Viewed Invoice Alert
- **Function:** `alert_invoice_viewed()`
- **Trigger:** Homeowner opens invoice
- **Priority:** STANDARD
- **Recipients:** Owner
- **Message:** "Homeowner viewed invoice X minutes ago"

#### B) Payment Failed Alert
- **Function:** `alert_payment_failed()`
- **Trigger:** Payment attempt failed
- **Priority:** CRITICAL
- **Recipients:** Owner
- **Message:** Includes failure reason

#### C) ACV Check Received Alert
- **Function:** `alert_acv_check_received()`
- **Trigger:** ACV check received
- **Priority:** IMPORTANT
- **Recipients:** Owner + Insurance Coordinators

#### D) Depreciation Pending Alert
- **Function:** `alert_depreciation_pending()`
- **Trigger:** Depreciation check overdue
- **Priority:** IMPORTANT
- **Recipients:** Owner + Insurance Coordinators

### 7. Insurance Alert Functions ✅

#### A) Supplement Ready Alert
- **Function:** `alert_supplement_ready()`
- **Trigger:** Supplement ready to submit
- **Priority:** IMPORTANT
- **Recipients:** Owner + Insurance Coordinators

#### B) Supplement Denied Alert
- **Function:** `alert_supplement_denied()`
- **Trigger:** Supplement denied by insurance
- **Priority:** CRITICAL (Red Bar)
- **Recipients:** Owner + Insurance Coordinators

#### C) Missing Documentation Alert
- **Function:** `alert_missing_documentation()`
- **Trigger:** Required documents missing
- **Priority:** CRITICAL (Red Bar)
- **Recipients:** Owner + Insurance Coordinators
- **Message:** Lists missing documents

### 8. Owner Daily Briefing Function ✅

**Function:** `generate_owner_daily_briefing()`

Generates comprehensive daily intelligence briefing with:
- ✅ New hot leads (last 7 days)
- ✅ Jobs at risk (high-risk alerts, material issues, weather alerts)
- ✅ Jobs ready to close (completed with cleanup confirmed)
- ✅ Invoices overdue (count + total amount)
- ✅ Crews behind schedule
- ✅ Weather alert jobs
- ✅ Material shortage jobs
- ✅ Insurance delays
- ✅ Revenue forecast changes

**Delivery:** In-App notification with full briefing data in JSONB payload

### 9. Background Monitoring Functions ✅

#### A) Monitor Lead Contact Times
- **Function:** `monitor_lead_contact_times()`
- **Purpose:** Checks leads created in last 24 hours
- **Action:** Alerts if not contacted within 15 minutes
- **Returns:** Count of alerts created

#### B) Monitor Job Risks
- **Function:** `monitor_job_risks()`
- **Purpose:** Checks for job risk factors
- **Checks:**
  - Material orders not confirmed
  - Permits missing
  - Labor hours exceeding target
- **Returns:** Count of alerts created

#### C) Monitor Crew Check-ins
- **Function:** `monitor_crew_check_ins()`
- **Purpose:** Checks for crews that should have checked in
- **Action:** Alerts if crew is late
- **Returns:** Count of alerts created

### 10. Updated Core Notification Function ✅

**Function:** `create_smartsend_notification()`

Extended to support:
- `p_risk_score` - Risk score (0-100)
- `p_requires_action` - Whether action required
- `p_alert_context` - Additional context (JSONB)

All new alert functions use these parameters to provide richer intelligence.

## Alert Categories & Types

### Lead Alerts
- `hot_lead` - New hot lead detected
- `lead_not_contacted` - Lead not contacted in 15+ minutes
- `lead_opened_quote` - Quote viewed by homeowner
- `hot_lead_behavior` - Strong intent signals detected

### Job Risk Alerts
- `weather_risk_high` - Weather risk detected
- `material_not_confirmed` - PO not confirmed
- `crew_not_checked_in` - Crew late
- `missing_cleanup_photos` - Cleanup photos missing
- `permit_not_uploaded` - Permit missing
- `labor_hours_exceed_target` - Labor over budget

### Material & Supplier Alerts
- `material_shortage` - Missing materials
- `wrong_material_delivered` - Wrong items delivered
- `delivery_delayed` - Supplier delayed
- `dumpster_not_delivered` - Dumpster missing

### Crew Alerts
- `crew_briefing` - Tomorrow's job briefing
- `crew_behind_schedule` - Progress behind expected
- `crew_delay` - Crew late/not checked in
- `crew_missing_docs` - Missing documentation

### Payment Alerts
- `invoice_viewed` - Homeowner viewed invoice
- `payment_failed` - Payment attempt failed
- `payment_overdue` - Invoice overdue
- `acv_check_received` - ACV check received
- `depreciation_pending` - Depreciation check pending

### Insurance Alerts
- `supplement_ready` - Supplement ready to submit
- `supplement_approved` - Supplement approved
- `supplement_denied` - Supplement denied
- `adjuster_requested_info` - Missing documentation
- `claim_stalled` - Claim stalled

## Priority Levels

### 🔴 CRITICAL (Instant Push + SMS)
- Hot leads
- Payment failed
- Material shortages
- Weather risks
- Permits missing
- Supplements denied
- Missing documentation

### 🟠 IMPORTANT (Push + In-App)
- Lead not contacted
- Quote viewed
- Crew delays
- Supplier delays
- Payment overdue
- ACV/depreciation issues
- Supplements ready

### 🟡 STANDARD (In-App Only)
- Invoice viewed
- Crew briefings
- Routine updates

## Integration Points

### Where Alerts Are Created

1. **Lead Creation** - Call `alert_new_lead()` when new lead created
2. **Lead Monitoring** - Run `monitor_lead_contact_times()` every 5 minutes
3. **Quote Views** - Call `alert_quote_viewed()` when quote opened
4. **Job Monitoring** - Run `monitor_job_risks()` every hour
5. **Crew Monitoring** - Run `monitor_crew_check_ins()` every 15 minutes
6. **Weather API** - Call `alert_weather_risk_high()` when weather detected
7. **Material Delivery** - Call material alert functions when issues detected
8. **Payment Processing** - Call payment alert functions on events
9. **Insurance Updates** - Call insurance alert functions on status changes
10. **Daily Briefing** - Run `generate_owner_daily_briefing()` at 6 AM

## Setup Instructions

### 1. Run Migration

```bash
# The migration will be applied automatically via Supabase migrations
# Or run manually:
psql $DATABASE_URL -f supabase/migrations/20250230000001_block25620_roofing_alerts_intelligence_v1.sql
```

### 2. Schedule Background Monitoring

Set up cron jobs or scheduled functions to run monitoring:

```sql
-- Monitor leads every 5 minutes
SELECT cron.schedule(
  'monitor-leads',
  '*/5 * * * *',
  $$
  SELECT public.monitor_lead_contact_times(workspace_id)
  FROM public.workspaces
  WHERE is_active = true
  $$
);

-- Monitor job risks every hour
SELECT cron.schedule(
  'monitor-job-risks',
  '0 * * * *',
  $$
  SELECT public.monitor_job_risks(workspace_id)
  FROM public.workspaces
  WHERE is_active = true
  $$
);

-- Monitor crew check-ins every 15 minutes
SELECT cron.schedule(
  'monitor-crew-checkins',
  '*/15 * * * *',
  $$
  SELECT public.monitor_crew_check_ins(workspace_id)
  FROM public.workspaces
  WHERE is_active = true
  $$
);

-- Daily briefing at 6 AM
SELECT cron.schedule(
  'daily-briefing',
  '0 6 * * *',
  $$
  SELECT public.generate_owner_daily_briefing(workspace_id, CURRENT_DATE)
  FROM public.workspaces
  WHERE is_active = true
  $$
);
```

### 3. Integrate Alert Functions

Call alert functions from your application code:

```typescript
// Example: Alert when new lead created
await supabase.rpc('alert_new_lead', {
  p_workspace_id: workspaceId,
  p_lead_id: leadId,
  p_contact_name: 'John Smith'
});

// Example: Alert when quote viewed
await supabase.rpc('alert_quote_viewed', {
  p_workspace_id: workspaceId,
  p_lead_id: leadId,
  p_proposal_id: proposalId,
  p_minutes_ago: 17,
  p_contact_name: 'John Smith'
});

// Example: Alert weather risk
await supabase.rpc('alert_weather_risk_high', {
  p_workspace_id: workspaceId,
  p_job_id: jobId,
  p_weather_type: 'rain',
  p_forecast_time: '2025-02-28 13:00:00',
  p_severity: 'high',
  p_job_title: 'Baker Roof Replacement'
});
```

## Usage Examples

### Creating Alerts from Code

```typescript
import { createSupabaseServer } from "@/lib/supabaseServer";

const supabase = createSupabaseServer();

// Alert new lead
await supabase.rpc('alert_new_lead', {
  p_workspace_id: workspaceId,
  p_lead_id: leadId,
  p_contact_name: 'John Smith'
});

// Alert material shortage
await supabase.rpc('alert_material_shortage', {
  p_workspace_id: workspaceId,
  p_job_id: jobId,
  p_missing_items: ['Ridge cap', 'Drip edge'],
  p_supplier_name: 'ABC Supply',
  p_job_title: 'Johnson Roof'
});

// Alert crew behind schedule
await supabase.rpc('alert_crew_behind_schedule', {
  p_workspace_id: workspaceId,
  p_job_id: jobId,
  p_crew_id: crewId,
  p_expected_progress: 75,
  p_actual_progress: 50,
  p_hours_behind: 2,
  p_crew_name: 'Crew A',
  p_job_title: 'Smith Roof'
});
```

## Acceptance Criteria Status

✅ Lead & Sales Alerts (new lead, not contacted, quote viewed, hot behavior)  
✅ Job Risk Alerts (weather, materials, crew, permits, labor hours)  
✅ Material & Supplier Alerts (shortages, delays, wrong items, dumpster)  
✅ Crew Alerts (briefings, check-ins, behind schedule)  
✅ Payment Alerts (viewed, failed, overdue, ACV, depreciation)  
✅ Insurance Alerts (supplements, approvals, denials, documentation)  
✅ Owner Daily Briefing with all intelligence metrics  
✅ Background monitoring functions for automatic alert generation  
✅ Risk scoring system (0-100)  
✅ Action-required tracking  
✅ Alert intelligence table for pattern analysis  
✅ All alerts properly routed to correct roles  
✅ Priority levels (CRITICAL, IMPORTANT, STANDARD)  
✅ Multi-channel delivery (push, SMS, in-app)  

## Files Created

- `supabase/migrations/20250230000001_block25620_roofing_alerts_intelligence_v1.sql` - Main migration file
- `BLOCK_25620_ROOFING_ALERTS_INTELLIGENCE_V1_IMPLEMENTATION.md` - This file

## Next Steps

1. **Integrate with Weather API** - Connect weather service to automatically detect risks
2. **Integrate with Payment Processor** - Connect Stripe/PayPal to detect payment events
3. **Add Alert Analytics** - Track alert effectiveness and response times
4. **Add Alert Suppression** - Prevent duplicate alerts for same issue
5. **Add Alert Escalation** - Escalate unresolved alerts after time period
6. **Add Alert Templates** - Customizable alert messages per workspace
7. **Add Alert Preferences UI** - Settings page for users to configure alert preferences
8. **Add Alert History** - Archive and search past alerts
9. **Add Alert Dashboard** - Visual dashboard showing alert trends
10. **Add Mobile Push Notifications** - Implement push notifications for mobile apps

## Notes

- All alerts are scoped by `workspace_id` for multi-tenant security
- Risk scores help prioritize which alerts need immediate attention
- Action-required flag helps track which alerts need follow-up
- Background monitoring functions can be run on schedule or on-demand
- Daily briefing provides owner with comprehensive intelligence snapshot
- Alert intelligence table enables pattern analysis and ML improvements
- All functions use existing notification infrastructure for delivery
- Functions gracefully handle missing data (NULL checks throughout)




































