# Block 24500 — SmartSend Roofing Insurance Flow v1 Implementation

## Overview

This implementation delivers **THE FULL INSURANCE ENGINE — ZERO FLUFF** for SmartSend. Insurance is where roofers make their BIGGEST money — and also lose the MOST money from missed supplements, slow homeowners, confused adjusters, forgotten depreciation, lost documentation, poor follow-up, and not knowing the process.

SmartSend Insurance Flow v1 turns chaos into a clean, step-by-step system that roofers can rely on.

## What Was Built

### 1. Core Database Tables

#### `job_insurance_flow`
The main table tracking the complete 6-step insurance workflow for each job. Every job with insurance gets a dedicated Insurance Tab showing:

- **Insurance Type & Basic Info**: Insurance type, carrier, claim number
- **Step 1 — Initial Claim Filed**: Claim filed date, homeowner status
- **Step 2 — Adjuster Inspection Scheduled**: Adjuster info, inspection dates, prep checklist
- **Step 3 — ACV Payment Tracking**: ACV amount, received status, deposited status
- **Step 4 — Supplement Management**: Supplement amount, status (not_submitted/submitted/pending/approved/denied), dates
- **Step 5 — Depreciation (RCV) Tracking**: RCV amount, deductible, depreciation owed, payment status
- **Step 6 — Final Insurance Cleanup**: Final photos, completion certificate, final invoice, depreciation reminder
- **Next Required Action**: Auto-calculated next step
- **Insurance Health Score**: 0-100 score indicating workflow health

#### `insurance_flow_timeline`
Visual timeline showing all insurance stages and their status:
- Stage (claim_filed, adjuster_inspection_scheduled, acv_payment_tracking, etc.)
- Status (not_started, in_progress, completed, blocked)
- Dates (started, completed, due)
- Stage-specific data stored as JSONB

#### `insurance_flow_alerts`
Early-warning alerts for insurance issues:
- Alert types: adjuster_not_responded, supplement_not_submitted, depreciation_not_released, homeowner_not_filed_claim, final_invoice_not_submitted, acv_not_received, supplement_pending_too_long, depreciation_overdue
- Alert severity: low, medium, high, critical
- Resolution tracking

### 2. Automated Functions

#### `calculate_insurance_next_action(job_id)`
Automatically determines what the roofer needs to do next based on workflow state:
- If claim not filed → "File insurance claim with homeowner"
- If adjuster not scheduled → "Schedule adjuster inspection"
- If ACV not received → "Follow up on ACV check"
- If supplement needed → "Submit supplement request"
- If supplement pending → "Follow up on supplement status"
- If depreciation not collected → "Follow up on depreciation payment"
- If final cleanup needed → "Upload final photos" / "Upload completion certificate" / "Send final invoice to insurance"

#### `calculate_insurance_health_score(job_id)`
Calculates insurance health score (0-100) based on workflow progress and issues:
- **🟢 80–100**: Insurance on track
- **🟡 60–79**: Delays forming
- **🔴 0–59**: Critical issues

Penalty reasons:
- Missing ACV (-20 points)
- Supplement not submitted (-15 points)
- Supplement pending too long (-10 points)
- Depreciation overdue (-15 points)
- Adjuster not responsive (-10 points)
- Homeowner hasn't filed claim (-15 points)
- Final invoice not submitted (-10 points)

#### `check_insurance_flow_alerts(job_id)`
Creates early-warning alerts for insurance issues:
- "Adjuster has not responded in 3 days"
- "Supplement not submitted"
- "Supplement has been pending for 5 days"
- "Depreciation is still unpaid"
- "Homeowner hasn't filed claim"
- "ACV check has NOT been recorded"
- "Final invoice not submitted"

### 3. Insurance Templates

Five automated insurance templates added to `email_templates` table:

1. **To Homeowner — Claim Filing Guidance**
   - Template key: `insurance_claim_filing_guidance`
   - Helps homeowners file their insurance claim step-by-step

2. **To Adjuster — Supplement Request**
   - Template key: `insurance_supplement_request`
   - Professional template for requesting supplements

3. **To Homeowner — ACV Check Reminder**
   - Template key: `insurance_acv_check_reminder`
   - Reminds homeowners about ACV payment status

4. **To Insurance — Final Invoice Submission**
   - Template key: `insurance_final_invoice_submission`
   - Requests depreciation funds release

5. **To Homeowner — Depreciation Reminder**
   - Template key: `insurance_depreciation_reminder`
   - Reminds homeowners about depreciation payment

### 4. Convenience View

#### `insurance_flow_summary`
Comprehensive view showing all insurance flow data with:
- Job info (title, status, value)
- Step-by-step status for all 6 steps
- Health score category (🟢 On Track / 🟡 Delays Forming / 🔴 Critical Issues)
- Active alerts count

## The 6-Step SmartSend Insurance Flow

### Step 1 — Initial Claim Filed
SmartSend tracks:
- Date homeowner filed
- Claim number
- Carrier
- Adjuster assigned

If homeowner hasn't filed:
- SmartSend sends: "Here's how to file your claim with your insurance. Need help?"

### Step 2 — Adjuster Inspection Scheduled
SmartSend asks:
- "Want me to add the adjuster inspection to your calendar?"

SmartSend sends:
- Reminder to homeowner
- Reminder to roofer
- Inspection prep checklist (photo documentation, notes about leaks, hail/wind damage summaries, measurements, Xactimate notes)

### Step 3 — ACV Payment Tracking
SmartSend tracks:
- ACV approved amount
- ACV received
- ACV deposited (optional)

SmartSend notifies:
- "ACV check has NOT been recorded — this delays scheduling."

### Step 4 — Supplement Management
SmartSend manages:
- Supplement submitted date
- Supplement approved
- Supplement denied
- Supplement pending
- Amount difference

SmartSend auto-sends to the roofer:
- "Supplement has been pending for 5 days — want me to follow up with adjuster?"
- Email draft: "Hi, following up on the supplemental request for Claim #12345…"

### Step 5 — Depreciation (RCV) Tracking
SmartSend monitors:
- Depreciation owed
- Date final invoice sent
- Date depreciation approved
- Depreciation payment received

SmartSend reminds roofer:
- "Depreciation is still unpaid — send reminder?"
- Sends homeowner: "Once the final invoice is submitted, your insurance will release the remaining funds."

### Step 6 — Final Insurance Cleanup
After job completion:
- Upload final photos?
- Upload completion certificate?
- Send final invoice to insurance?
- Send depreciation reminder to homeowner?

Once everything is done, SmartSend marks:
- Insurance: Complete ✔

## Insurance Health Score

Part of Job Health Score, SmartSend gives a separate insurance score:

- **🟢 80–100**: Insurance on track
- **🟡 60–79**: Delays forming
- **🔴 0–59**: Critical issues

Main penalty reasons:
- Missing ACV
- No supplement submitted
- Depreciation overdue
- Adjuster unresponsive
- Homeowner confused

## Early-Warning Insurance Alerts

SmartSend notifies roofer:
- "Adjuster has not responded in 3 days"
- "Supplement not submitted"
- "Depreciation not released"
- "Homeowner hasn't filed claim"
- "Final invoice not submitted"

## How This Engine Increases Roofer Revenue

- ✔ More supplements = higher job value
- ✔ Faster ACV collection = better cashflow
- ✔ Faster depreciation = final payment sooner
- ✔ Fewer delays = more jobs per month
- ✔ Cleaner process = more 5-star reviews
- ✔ Happier homeowners = more referrals

**The math is simple: SmartSend Insurance Engine = thousands more per roof job.**

## Database Schema

### Tables Created
1. `job_insurance_flow` - Main insurance workflow tracking
2. `insurance_flow_timeline` - Visual timeline of stages
3. `insurance_flow_alerts` - Early-warning alerts

### Functions Created
1. `calculate_insurance_next_action(uuid)` - Determines next action
2. `calculate_insurance_health_score(uuid)` - Calculates health score
3. `check_insurance_flow_alerts(uuid)` - Creates alerts

### Views Created
1. `insurance_flow_summary` - Comprehensive insurance flow view

### Templates Added
1. `insurance_claim_filing_guidance`
2. `insurance_supplement_request`
3. `insurance_acv_check_reminder`
4. `insurance_final_invoice_submission`
5. `insurance_depreciation_reminder`

## Usage Examples

### Create Insurance Flow for a Job

```sql
INSERT INTO job_insurance_flow (
  job_id,
  workspace_id,
  insurance_type,
  carrier,
  claim_number,
  claim_filed_date,
  claim_filed,
  homeowner_filed_claim
) VALUES (
  'job-uuid-here',
  'workspace-uuid-here',
  'homeowners',
  'State Farm',
  'CLM-12345',
  CURRENT_DATE,
  true,
  true
);
```

### Get Next Required Action

```sql
SELECT calculate_insurance_next_action('job-uuid-here');
```

### Get Insurance Health Score

```sql
SELECT calculate_insurance_health_score('job-uuid-here');
```

### View Insurance Flow Summary

```sql
SELECT * FROM insurance_flow_summary 
WHERE workspace_id = 'workspace-uuid-here'
ORDER BY insurance_health_score DESC;
```

### Check for Alerts

```sql
SELECT * FROM insurance_flow_alerts
WHERE job_id = 'job-uuid-here'
  AND is_resolved = false
ORDER BY alert_severity DESC, created_at DESC;
```

## Integration Points

### With Existing Insurance Tables
- Works alongside `job_insurance_claims` table (Block 22420)
- Can sync data with `insurance_metadata` table (Block 17400)
- Integrates with `insurance_timeline` table (Block 17400)

### With Job Health Score
- Insurance health score can be factored into overall job health score
- Use `insurance_health_score` field in `job_insurance_flow` table

### With Templates
- All insurance templates are stored in `email_templates` table
- Templates support AI rewriting via `use_ai_rewriter` flag
- Variables like `{{first_name}}`, `{{claim_number}}`, `{{acv_amount}}` are supported

## Next Steps

1. **Frontend Implementation**: Build the Insurance Tab UI in the job detail view
2. **API Endpoints**: Create REST endpoints for insurance flow CRUD operations
3. **Automated Workflows**: Set up background jobs to check alerts and update health scores
4. **Notifications**: Integrate alerts with notification system
5. **Reporting**: Add insurance metrics to dashboard

## Migration File

The migration file is located at:
`supabase/migrations/20250130000001_block24500_insurance_flow_v1.sql`

Run the migration to set up all tables, functions, views, and templates.






































