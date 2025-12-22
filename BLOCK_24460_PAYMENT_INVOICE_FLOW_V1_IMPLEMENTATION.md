# Block 24460 — SmartSend Roofing Payment & Invoice Flow v1 Implementation

## Overview

This block builds the financial backbone for SmartSend, ensuring roofers get paid on time, avoid cashflow problems, and stop losing money due to poor tracking.

## What Was Built

### 1. Enhanced Payment Tables

**Enhanced `job_invoices` table:**
- Added `payment_type` column supporting: `deposit`, `acv_check`, `depreciation`, `final_invoice`, `progress`
- Added insurance check tracking fields: `check_photo_url`, `check_number`, `deposited_at`, `insurance_claim_id`
- Added reminder tracking: `reminder_sent_at`, `reminder_count`, `notes`

**Enhanced `job_payments` table:**
- Added `payment_type` column
- Added insurance check fields: `check_photo_url`, `check_number`, `insurance_claim_id`, `deposited_at`
- Added `notes` field

### 2. Payment Status Engine

**New `payment_status_engine` table:**
- Tracks payment status for all payment types
- Statuses: `paid`, `unpaid`, `overdue`, `insurance_submitted`, `insurance_approved`, `insurance_deposited`, `pending_deposit`
- Automatically updates based on invoices and payments
- Triggers alerts for payment issues

**Key Functions:**
- `update_payment_status(p_job_id)` - Automatically updates payment status for all invoices in a job
- `check_payment_alerts(p_workspace_id)` - Checks for payment issues that need roofer attention

### 3. Automated Payment Reminders

**New `payment_reminders` table:**
- Tracks scheduled reminders for all payment types
- Reminder types: `deposit_reminder`, `acv_check_reminder`, `depreciation_reminder`, `final_invoice_reminder`, `overdue_reminder`
- Auto-schedules reminders when invoices are sent
- Integrates with email template system

**Email Templates Added:**
- `deposit_reminder` - "Just a reminder — deposit for your project"
- `acv_check_reminder` - "Any update on the ACV check?"
- `depreciation_reminder` - "Depreciation check reminder"
- `final_invoice_reminder` - "Hope you're loving the new roof!"

### 4. Cashflow Dashboard

**Views Created:**
- `cashflow_this_week` - This week cashflow summary by workspace
  - Collected amount
  - Expected amount
  - Outstanding amount
  - Overdue amount

- `cashflow_by_stage` - Cashflow breakdown by pipeline stage
  - Deposits due
  - ACV pending
  - Depreciation pending
  - Final invoices overdue

**Function:**
- `calculate_job_payment_summary(p_job_id)` - Returns complete payment summary for a job card
  - Total revenue
  - Collected amount
  - Outstanding amount
  - Received payments array
  - Pending payments array
  - Overdue payments array

### 5. Job Health Score Integration

**Function:**
- `calculate_payment_penalty(p_job_id)` - Calculates payment penalty for job health score
  - -15 points if deposit missing
  - -10 points if ACV check not received
  - -12 points if depreciation overdue
  - -20 points if final invoice not paid after 21 days
  - -10 points if final invoice overdue < 21 days

### 6. Auto-Triggers Based on Pipeline Stage

**Trigger Function:**
- `trigger_payment_actions_on_stage_change()` - Auto-triggers payment actions when job stage changes

**Stage Actions:**
- **CLAIM_APPROVED** → Auto-creates deposit invoice (draft, 20% of job value)
- **SCHEDULED_INSTALL** → Updates payment status, confirms ACV check received
- **IN_PROGRESS** → Updates payment statuses, checks for ACV and supplements
- **COMPLETED** → Auto-creates final invoice (draft, remaining balance, due in 14 days)

**Auto-Reminder Triggers:**
- `trigger_schedule_reminders_on_invoice_sent()` - Auto-schedules reminders when invoice status changes to 'sent'
- `trigger_update_payment_status_on_payment()` - Updates payment status when payment is received

## Database Schema

### New Tables

1. **payment_status_engine**
   - Tracks payment status for all payment types
   - Links to jobs, invoices, and insurance claims
   - Automatically updates status based on dates and payments

2. **payment_reminders**
   - Tracks scheduled payment reminders
   - Links to jobs, invoices, and email sends
   - Supports multiple reminder types

### Enhanced Tables

1. **job_invoices**
   - Added `payment_type` column
   - Added insurance check tracking fields
   - Added reminder tracking fields

2. **job_payments**
   - Added `payment_type` column
   - Added insurance check tracking fields

## Key Features

### Payment Tracking
- ✅ Four payment types: Deposit, ACV Check, Depreciation, Final Invoice
- ✅ Automatic status updates
- ✅ Overdue detection
- ✅ Insurance check tracking

### Automated Reminders
- ✅ Auto-scheduled when invoices are sent
- ✅ Configurable delay (default 3 days)
- ✅ Multiple reminder types
- ✅ Email template integration

### Cashflow Dashboard
- ✅ This week summary
- ✅ By stage breakdown
- ✅ Job-level summary
- ✅ Overdue tracking

### Health Score Integration
- ✅ Payment penalties affect job health score
- ✅ Prevents starting jobs without deposits
- ✅ Flags overdue payments
- ✅ Tracks insurance delays

### Auto-Triggers
- ✅ Deposit invoice created at CLAIM_APPROVED
- ✅ Final invoice created at COMPLETED
- ✅ Payment status updates on stage changes
- ✅ Reminders scheduled automatically

## Usage Examples

### Get Payment Summary for a Job
```sql
SELECT * FROM calculate_job_payment_summary('job-uuid-here');
```

### Check for Payment Alerts
```sql
SELECT * FROM check_payment_alerts('workspace-uuid-here');
```

### Get This Week Cashflow
```sql
SELECT * FROM cashflow_this_week WHERE workspace_id = 'workspace-uuid-here';
```

### Get Cashflow by Stage
```sql
SELECT * FROM cashflow_by_stage WHERE workspace_id = 'workspace-uuid-here';
```

### Calculate Payment Penalty for Health Score
```sql
SELECT calculate_payment_penalty('job-uuid-here');
```

## Integration Points

1. **Job Health Score** - Payment penalties automatically affect health score
2. **Pipeline Stages** - Auto-triggers payment actions at key stages
3. **Email Templates** - Payment reminders use email template system
4. **Insurance Claims** - Links to `job_insurance_claims` table
5. **Workspace System** - All data scoped by workspace

## Next Steps

1. **Frontend Integration**
   - Build payment tab in job card UI
   - Create cashflow dashboard page
   - Add payment reminder management UI

2. **Email Sending**
   - Integrate reminder scheduler with email sending system
   - Send reminders based on `payment_reminders` table

3. **Stripe Integration**
   - Link payment links to invoices
   - Auto-update payment status on Stripe webhook

4. **Reporting**
   - Add payment analytics
   - Create revenue reports
   - Track collection rates

## Files Modified

1. `supabase/migrations/20250201000003_block24460_payment_invoice_flow_v1.sql` - Main migration
2. `supabase/migrations/20250130000001_ai_rewrite_templates.sql` - Added payment reminder email templates

## Notes

- The system handles both `org_id` (from job_invoices) and `workspace_id` (from roofing_jobs)
- Payment status engine automatically syncs with invoices and payments
- Reminders are scheduled but not automatically sent - requires email sending integration
- Health score penalties are calculated but need to be integrated into main health score function






































