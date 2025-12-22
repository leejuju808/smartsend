# BLOCK 26200 — SMARTSEND ROOFING AR/AP COLLECTIONS ENGINE v1

## Implementation Summary

This block implements a comprehensive Accounts Receivable (AR) and Accounts Payable (AP) collections engine for SmartSend Roofing. It tracks unpaid invoices, manages collections, and automatically generates follow-up tasks and email reminders.

## What Was Implemented

### 1. Database Structure (Supabase SQL Migration)

**File:** `supabase/migrations/20250220000001_block26200_roofing_ar_ap_collections_engine_v1.sql`

#### Tables Created:
- **`roofing_invoices`** - AR invoices (money owed to roofer)
  - Tracks payer information (homeowner, insurance, other)
  - Invoice metadata (number, description, amount, due date)
  - Insurance-specific fields (company, claim number, check stage)
  - Status tracking (draft, sent, partial, paid, overdue)

- **`roofing_payments`** - Payments received against invoices
  - Links to invoices and jobs
  - Payment method and date tracking
  - Automatic workspace/job ID population via triggers

- **`roofing_vendor_bills`** - AP vendor bills (money roofer owes vendors)
  - Vendor information and invoice tracking
  - Status and due date management

#### Views Created:
- **`roofing_invoice_balances`** - Live view of invoice balances
  - Calculates `balance_due = invoice_amount - amount_paid`
  - Includes all invoice and payment data in one query
  - Used throughout the UI for displaying collections data

#### Functions Created:
- **`update_invoice_status_after_payment()`** - Automatically updates invoice status when payments are added
- **`mark_overdue_invoices()`** - Marks invoices as overdue when due date passes

#### Triggers Created:
- Auto-populate workspace_id from job relationships
- Auto-update invoice status when payments are added
- Auto-update `updated_at` timestamps

#### Security:
- Row Level Security (RLS) policies for all tables
- Workspace-based access control
- Proper grants for authenticated users

### 2. Collections Engine (Edge Function)

**File:** `supabase/functions/generate-collections-tasks/index.ts`

**Scheduled:** Daily at 8 AM UTC (via `supabase/functions/_scheduled/cron.yaml`)

**Functionality:**
- Calls `mark_overdue_invoices()` to refresh overdue statuses
- Finds invoices that are overdue or due within 3 days
- Enqueues email reminders to payers
- Creates call tasks for office team
- Processes all unpaid invoices with balance > 0

**Email Reminders:**
- Personalized messages with invoice details
- Different messaging for overdue vs. upcoming due dates
- Includes balance breakdown and due date

**Task Creation:**
- Creates tasks in the `tasks` table for follow-up calls
- Sets priority based on overdue status
- Links to jobs and invoices for context

### 3. Job Collections Card Component

**File:** `app/(dashboard)/jobs/[jobId]/components/JobCollectionsCard.tsx`

**Features:**
- Displays total invoiced, total collected, and balance due
- Shows all invoices for a job in a table
- Status badges (paid, overdue, partial, sent)
- Real-time balance calculations
- Integrated into job detail page

**Location:** Added to job detail page at `/jobs/[jobId]`

### 4. Global Collections View Page

**File:** `app/(dashboard)/collections/page.tsx`

**Features:**
- Summary cards showing total balance, overdue count, and invoice count
- Advanced filtering:
  - Status filter (all, overdue, sent, partial, draft)
  - Payer type filter (all, homeowner, insurance, other)
  - Search by name, email, invoice number, claim number
- Comprehensive invoice table with:
  - Invoice details and job links
  - Payer information
  - Due dates and status
  - Balance amounts
- Quick actions:
  - Send reminder email
  - Create call task
  - Mark as paid

**Location:** `/collections`

### 5. API Routes

#### Send Reminder Email
**File:** `app/api/collections/send-reminder/route.ts`
- Sends personalized reminder emails to payers
- Enqueues emails in send_queue
- Includes invoice balance and due date information

#### Add Payment
**File:** `app/api/collections/add-payment/route.ts`
- Records payments against invoices
- Automatically triggers invoice status updates via triggers
- Supports manual payment entry

#### Create Call Task
**File:** `app/api/collections/create-task/route.ts`
- Creates follow-up tasks for collections calls
- Links tasks to invoices and jobs
- Sets appropriate priority based on overdue status

## How It Works

### Invoice Lifecycle

1. **Invoice Creation** → Status: `draft`
2. **Invoice Sent** → Status: `sent`
3. **Payment Received** → Status updates to `partial` or `paid` automatically
4. **Due Date Passes** → Status updates to `overdue` (via daily cron)
5. **Collections Engine** → Creates reminders and tasks for overdue invoices

### Automatic Status Updates

- When a payment is added, the trigger `update_invoice_status_after_payment()` runs
- Compares total paid vs. invoice amount
- Updates status: `sent` → `partial` → `paid`
- Daily cron calls `mark_overdue_invoices()` to mark overdue invoices

### Collections Workflow

1. **Daily at 8 AM:** Collections engine runs
2. **Finds invoices:** Overdue or due within 3 days with balance > 0
3. **Sends emails:** Personalized reminders to payers
4. **Creates tasks:** Call tasks for office team
5. **Owner views:** Collections page shows all unpaid invoices
6. **Team acts:** Sends reminders, makes calls, records payments

## Database Schema

### Key Relationships

```
roofing_jobs (1) ──→ (many) roofing_invoices
roofing_invoices (1) ──→ (many) roofing_payments
roofing_jobs (1) ──→ (many) roofing_vendor_bills
```

### Important Fields

**roofing_invoices:**
- `payer_type`: 'homeowner' | 'insurance' | 'other'
- `status`: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue'
- `check_stage`: 'none' | 'acv_issued' | 'depreciation_pending' | 'final_paid' (for insurance)

**roofing_invoice_balances view:**
- `balance_due`: Calculated as `invoice_amount - amount_paid`
- Always up-to-date via SQL view

## Benefits for Roofers

1. **Fewer invoices slip through cracks**
   - Every invoice has status, balance, due date
   - Automatic reminders prevent forgotten payments

2. **Faster insurance collections**
   - Track check stages (ACV, depreciation, final)
   - Automatic follow-ups for missing checks

3. **Stronger cash position**
   - Clear visibility into AR
   - Better cashflow forecasting

4. **Less owner stress**
   - System generates calls and emails automatically
   - No need to remember who to call

5. **Makes SmartSend untouchable**
   - Integrated revenue infrastructure
   - Not just "email software" - it's the money collector

## Next Steps

1. **Deploy migration** to production database
2. **Deploy Edge Function** and verify cron schedule
3. **Test collections engine** with sample invoices
4. **Train users** on Collections page and job card
5. **Monitor** collections effectiveness and adjust reminders as needed

## Files Created/Modified

### New Files:
- `supabase/migrations/20250220000001_block26200_roofing_ar_ap_collections_engine_v1.sql`
- `supabase/functions/generate-collections-tasks/index.ts`
- `app/(dashboard)/jobs/[jobId]/components/JobCollectionsCard.tsx`
- `app/(dashboard)/collections/page.tsx`
- `app/api/collections/send-reminder/route.ts`
- `app/api/collections/add-payment/route.ts`
- `app/api/collections/create-task/route.ts`

### Modified Files:
- `supabase/functions/_scheduled/cron.yaml` (added collections engine schedule)
- `app/(dashboard)/jobs/[jobId]/page.tsx` (added JobCollectionsCard)

## Testing Checklist

- [ ] Create test invoice
- [ ] Add payment and verify status updates
- [ ] Verify overdue marking works
- [ ] Test collections engine Edge Function
- [ ] Verify email reminders are enqueued
- [ ] Verify tasks are created
- [ ] Test Collections page filters
- [ ] Test quick actions (send reminder, mark paid, create task)
- [ ] Verify JobCollectionsCard displays correctly
- [ ] Test RLS policies

## Notes

- The collections engine integrates with existing `send_queue` and `tasks` tables
- Falls back gracefully if tables don't exist or have different schemas
- Insurance check stages help track multi-payment insurance claims
- Vendor bills (AP) table is ready for future AP management features



































