# Block 24860 — SmartSend Roofing Alerts & Automations v1 Implementation

## 🎯 Mission

**THIS IS THE BRAIN THAT HOLDS THE WHOLE SYSTEM TOGETHER — ZERO FLUFF.**

This block makes SmartSend intelligent. Not just a CRM. Not just a tracker. Not just a workflow.

This is the real-time alert + automation system that monitors every job, every crew, every supplier, every payment, every homeowner message — and triggers actions automatically.

**This is how SmartSend becomes a revenue protection engine for roofers.**

---

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block24860_alerts_automations_v1.sql`

#### Core Tables Created:

**A) `roofing_alerts` Table**
- Main alerts table for all 6 categories
- Fields:
  - `category`: homeowner, crew, supplier, insurance, payment, job_risk
  - `priority`: critical, high, medium, low
  - `status`: active, acknowledged, resolved, dismissed
  - Flexible entity references (job_id, lead_id, crew_id, supplier_id, invoice_id, insurance_claim_id, material_order_id)
  - Escalation tracking (`escalated_to_owner`, `escalated_at`)
  - Automated fix tracking (`auto_fix_available`, `auto_fix_type`, `auto_fix_executed`)

**B) `automated_fixes` Table**
- Tracks automated fix executions
- Fix types: auto_followup, material_confirmation, crew_reminder, insurance_nudge, payment_reminder, weather_action, etc.
- Execution status tracking and results

**C) `alert_settings` Table**
- Personalized alert settings per user/workspace
- Category enable/disable settings
- Priority thresholds per category
- Alert frequency (realtime, hourly, daily, weekly)
- Job risk thresholds, weather sensitivity, payment rules, insurance rules, crew rules
- Throttling configuration

**D) `missing_steps` Table**
- Missing Step Detector — tracks missing actions
- Step types: contract_upload, deposit_collection, completion_photos, supplement_submission, review_request, etc.
- Status tracking (detected, in_progress, completed, dismissed)

**E) `pipeline_automations` Table**
- Automations for each pipeline stage
- Stages: lead_in, inspection_set, quote_sent, approved, scheduled, installed, completed
- Automation types: send_intro_sequence, notify_no_inspection, send_appointment_confirmation, etc.
- Configuration with delays and conditions

#### Database Functions Created:

**Alert Detection Functions:**
- `detect_homeowner_alerts()` — Category 1: Homeowner Alerts
  - No reply after 48 hours
  - Homeowner confused (negative sentiment)
  - Reschedule request
  - Payment reminder needed

- `detect_crew_alerts()` — Category 2: Crew Alerts
  - No check-in
  - Late arrival
  - Missing documentation
  - Job taking too long
  - Unexpected issues

- `detect_supplier_alerts()` — Category 3: Supplier Alerts
  - Delivery delay
  - Incorrect materials
  - Missing line items
  - No delivery confirmation

- `detect_insurance_alerts()` — Category 4: Insurance Alerts
  - ACV not received
  - Supplement stalled
  - Depreciation not released
  - Adjuster not responding
  - Missing documentation

- `detect_payment_alerts()` — Category 5: Payment Alerts
  - Deposit not collected
  - Overdue invoice
  - Insurance payment missing
  - Check recorded late

- `detect_job_risk_alerts()` — Category 6: Job Risk Alerts
  - Job health score drops
  - Weather risk detected
  - Homeowner dissatisfaction
  - Materials delayed
  - Crew behind schedule

**Missing Step Detection:**
- `detect_missing_steps()` — Scans all jobs for missing actions
  - If job approved → no contract uploaded
  - If job scheduled → no deposit shown
  - If install complete → no completion photos
  - If insurance job → supplement not submitted
  - If job completed → review not requested

**Main Functions:**
- `create_roofing_alert()` — Creates roofing alerts with escalation logic
- `execute_automated_fix()` — Executes automated fixes
- `scan_and_create_alerts()` — Main function to scan all jobs and create alerts for all 6 categories

### 2. API Routes ✅

**Files:**
- `src/app/api/roofing-alerts/route.ts` — GET/POST /api/roofing-alerts
- `src/app/api/roofing-alerts/[id]/acknowledge/route.ts` — POST /api/roofing-alerts/[id]/acknowledge
- `src/app/api/roofing-alerts/[id]/execute-fix/route.ts` — POST /api/roofing-alerts/[id]/execute-fix
- `src/app/api/roofing-alerts/settings/route.ts` — GET/PUT /api/roofing-alerts/settings
- `src/app/api/roofing-alerts/missing-steps/route.ts` — GET/POST /api/roofing-alerts/missing-steps

**Features:**
- List alerts with filtering (category, priority, status, job_id, escalated)
- Trigger alert scan for all jobs
- Acknowledge alerts
- Execute automated fixes
- Manage alert settings (personalized preferences)
- View and scan missing steps

### 3. Alert Categories Implemented ✅

**Category 1 — Homeowner Alerts:**
- ✅ No reply after 48 hours
- ✅ Homeowner confused (negative sentiment detected)
- ✅ Reschedule request
- ✅ Payment reminder needed

**Category 2 — Crew Alerts:**
- ✅ No check-in
- ✅ Late arrival
- ✅ Missing documentation
- ✅ Job taking too long
- ✅ Unexpected issues

**Category 3 — Supplier Alerts:**
- ✅ Delivery delay
- ✅ Incorrect materials
- ✅ Missing line items
- ✅ No delivery confirmation

**Category 4 — Insurance Alerts:**
- ✅ ACV not received
- ✅ Supplement stalled
- ✅ Depreciation not released
- ✅ Adjuster not responding
- ✅ Missing documentation

**Category 5 — Payment Alerts:**
- ✅ Deposit not collected
- ✅ Overdue invoice
- ✅ Insurance payment missing
- ✅ Check recorded late

**Category 6 — Job Risk Alerts:**
- ✅ Job health score drops
- ✅ Weather risk detected
- ✅ Homeowner dissatisfaction
- ✅ Materials delayed
- ✅ Crew behind schedule

### 4. Automated Fixes (Smart Actions) ✅

**Implemented Fix Types:**
- ✅ Auto Follow-Up — Homeowner hasn't replied → SmartSend sends a message
- ✅ Material Confirmation Request — Supplier doesn't confirm → Request confirmation
- ✅ Crew Documentation Reminder — Crew doesn't upload photos → Send reminder
- ✅ Insurance Nudge — Supplement stalled → Send follow-up
- ✅ Payment Reminder — Final invoice overdue → Send reminder
- ✅ Weather Auto-Action — Rain/wind detected → Recommend rescheduling

### 5. Owner Escalations ✅

**Critical Escalations (🔴):**
- ✅ Deposit missing
- ✅ Material failure
- ✅ Homeowner angry
- ✅ Supplement denied
- ✅ Major delay
- ✅ Crew repeatedly late
- ✅ Risk of bad review

**High Priority (🟠):**
- ✅ Final invoice overdue
- ✅ Adjuster unresponsive
- ✅ Delivery time uncertain

Escalation messages appear in the Owner Inbox v2 (integrated with existing owner inbox system).

### 6. Personalized Alert Settings ✅

**Configurable Settings:**
- ✅ Who gets what alerts (category enable/disable)
- ✅ Alert frequency (realtime, hourly, daily, weekly)
- ✅ Alert categories
- ✅ Job risk threshold triggers
- ✅ Weather sensitivity
- ✅ Payment overdue rules
- ✅ Insurance follow-up delays
- ✅ Crew grading threshold

**Example Settings:**
- Crew Leaders receive: crew issues, missing photo uploads
- Admin receives: payment alerts, document missing alerts
- Owner receives: all high-risk issues, all money-related issues

### 7. Automations for Every Pipeline Stage ✅

**Stage: Lead In**
- ✅ Send intro sequence
- ✅ Notify rep if no inspection booked in 24 hours

**Stage: Inspection Set**
- ✅ Send appointment confirmation
- ✅ Remind homeowner day before
- ✅ Notify roofer if homeowner doesn't confirm

**Stage: Quote Sent**
- ✅ Auto follow-up
- ✅ Owner alert after 10 days with no response
- ✅ Revive sequence

**Stage: Approved**
- ✅ Trigger permit check
- ✅ Trigger delivery scheduling
- ✅ Ensure deposit paid

**Stage: Scheduled**
- ✅ Weather monitor activates
- ✅ Crew reminders
- ✅ Material confirmation alerts

**Stage: Installed**
- ✅ Final invoice send
- ✅ Review request sequence
- ✅ Warranty prep

### 8. Missing Step Detector ✅

**Detected Missing Steps:**
- ✅ If job approved → no contract uploaded → Alert: "Missing signed contract."
- ✅ If job scheduled → no deposit shown → Alert: "Deposit required to start job."
- ✅ If install complete → no completion photos → Alert: "Crew photos missing."
- ✅ If insurance job → supplement not submitted → Alert: "Possible missed supplement. Submit?"
- ✅ If job completed → review not requested → Alert: "You're missing a review opportunity."

---

## 🚀 How to Use

### 1. Scan for Alerts

```bash
POST /api/roofing-alerts
{
  "action": "scan"
}
```

This will scan all jobs and create alerts for all 6 categories.

### 2. List Alerts

```bash
GET /api/roofing-alerts?category=payment&priority=critical&status=active
```

### 3. Acknowledge Alert

```bash
POST /api/roofing-alerts/{alert_id}/acknowledge
```

### 4. Execute Automated Fix

```bash
POST /api/roofing-alerts/{alert_id}/execute-fix
{
  "fix_type": "auto_followup"
}
```

### 5. Configure Alert Settings

```bash
PUT /api/roofing-alerts/settings
{
  "enabled_categories": {
    "homeowner": true,
    "crew": true,
    "supplier": true,
    "insurance": true,
    "payment": true,
    "job_risk": true
  },
  "priority_thresholds": {
    "payment": "high",
    "insurance": "high"
  },
  "job_risk_score_threshold": 70
}
```

### 6. Scan Missing Steps

```bash
POST /api/roofing-alerts/missing-steps
{
  "action": "scan"
}
```

---

## 🔄 Background Job Processing

**Recommended Setup:**

Create a cron job or scheduled task that runs `scan_and_create_alerts()` every 15-30 minutes:

```sql
-- Run every 15 minutes
SELECT public.scan_and_create_alerts(NULL);
```

Or use Supabase Edge Functions with pg_cron:

```sql
-- Schedule alert scan every 15 minutes
SELECT cron.schedule(
  'scan-roofing-alerts',
  '*/15 * * * *',
  $$SELECT public.scan_and_create_alerts(NULL)$$
);
```

---

## 📊 Integration Points

### With Existing Systems:

1. **Job Health Score (Block 24420)** — Job risk alerts integrate with health score drops
2. **Payment Flow (Block 24460)** — Payment alerts integrate with payment status engine
3. **Insurance Flow (Block 24500)** — Insurance alerts integrate with insurance flow tracking
4. **Supplier Communication (Block 24340)** — Supplier alerts integrate with supplier communications
5. **Crew Management (Block 24380)** — Crew alerts integrate with crew assignments and readiness
6. **Owner Inbox (Block 24780)** — Escalated alerts appear in owner inbox

---

## 🎯 Key Benefits

**SmartSend prevents:**
- ✅ Lost revenue
- ✅ Schedule breakdowns
- ✅ Bad reviews
- ✅ Job delays
- ✅ Insurance losses
- ✅ Missed payments
- ✅ Messy operations
- ✅ Poor communication

**Roofers make MORE money with FEWER mistakes.**

**This becomes the safety system of their business. Canceling it would be dangerous.**

---

## 🔮 Future Enhancements

1. **Real-time WebSocket Updates** — Push alerts to frontend in real-time
2. **Email/SMS Notifications** — Send alerts via email/SMS based on user preferences
3. **AI-Powered Fix Suggestions** — Use AI to suggest better fixes
4. **Alert Analytics** — Track alert resolution times and patterns
5. **Custom Automation Rules** — Allow users to create custom automation rules
6. **Mobile Push Notifications** — Push critical alerts to mobile devices

---

## 📝 Notes

- All alerts are workspace-scoped
- RLS policies ensure users only see alerts for their workspace
- Automated fixes are executed asynchronously (status tracked in `automated_fixes` table)
- Missing steps are automatically detected and can trigger alerts
- Alert settings can be configured per-user or workspace-wide (user_id = NULL)

---

## ✅ Testing Checklist

- [ ] Alert detection functions work correctly
- [ ] Alert creation works for all 6 categories
- [ ] Automated fixes execute correctly
- [ ] Missing step detector finds missing steps
- [ ] Alert settings save and load correctly
- [ ] Escalation logic works (critical/high → owner)
- [ ] API routes return correct data
- [ ] RLS policies prevent unauthorized access
- [ ] Background job processor runs successfully

---

**Implementation Date:** January 30, 2025  
**Block Number:** 24860  
**Version:** v1






































