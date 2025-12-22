# Block 26280 — SmartSend Roofing Collections Email Playbooks v1 — Implementation Complete ✅

**Done-for-you invoice follow-up sequences • Homeowner + Insurance adjuster templates • Soft → Firm → Final escalation ladder**

## 🎯 Implementation Summary

Successfully implemented a comprehensive collections automation system that gives SmartSend elite collections automation that roofing companies NEVER want to write themselves. The system automatically selects and sends professional, proven email sequences that get people to PAY — without sounding aggressive or sloppy.

## 📦 What Was Implemented

### 1️⃣ Database Schema (`supabase/migrations/20250220000002_block26280_roofing_collections_playbooks_v1.sql`)

#### Collections Playbooks Table
- **`roofing_collections_playbooks`** table stores email templates for collections
- Pre-loaded with 8 default templates:
  - **Homeowner templates:** Soft Reminder, Professional Follow-up, Firm Reminder, Final Attempt
  - **Insurance templates:** ACV Check Reminder, Depreciation Release Request, Firm Depreciation Follow-Up, Final Payment Demand
- Each template has `payer_type` (homeowner/insurance) and `level` (soft/professional/firm/final)
- Templates use variables like `{{name}}`, `{{balance}}`, `{{invoice_number}}`, `{{due_date}}`, `{{claim_number}}`

#### Collection Reminders Tracking Table
- **`roofing_collection_reminders`** table tracks sent reminders to prevent duplicates
- Links reminders to invoices, playbooks, and send_queue items
- Prevents sending multiple reminders within 3 days
- Tracks escalation level progression

### 2️⃣ Database Functions

#### `select_collections_playbook(p_invoice_id, p_days_overdue)`
- Automatically selects the correct playbook based on:
  - Days overdue (0 = soft, 1-7 = professional, 8-15 = firm, 15+ = final)
  - Payer type (homeowner vs insurance)
  - Previous reminders sent (prevents downgrading escalation level)

#### `render_collections_template(p_template, p_invoice_id)`
- Renders template variables with actual invoice data
- Replaces `{{name}}`, `{{balance}}`, `{{invoice_number}}`, `{{due_date}}`, `{{claim_number}}`, etc.
- Formats currency and dates properly

#### `queue_collections_email(p_invoice_id, p_playbook_id)`
- Prepares collection email for queuing
- Returns reminder_id for API route to complete send_queue insertion
- Handles scheduling (soft reminders = next business day 9 AM, others = immediate)

### 3️⃣ API Route (`src/app/api/cron/collections/process-overdue/route.ts`)

#### Daily Cron Job
- **Endpoint:** `/api/cron/collections/process-overdue`
- **Schedule:** Daily at 9 AM (configured in `vercel.json`)
- **Authentication:** CRON_SECRET (header or query param)

#### Processing Logic
1. **Find Overdue Invoices**
   - Queries `roofing_invoice_balances` view
   - Filters for invoices with `status IN ('sent', 'partial', 'overdue')`
   - Only processes invoices with `balance_due > 0` and valid `payer_email`

2. **Determine Reminder Level**
   - Calculates days overdue from `due_date`
   - Selects appropriate level: soft → professional → firm → final
   - Checks previous reminders to prevent downgrading escalation

3. **Select Playbook**
   - Uses `select_collections_playbook()` function
   - Matches payer_type and level

4. **Render Templates**
   - Renders subject and body templates with invoice variables
   - Formats currency and dates

5. **Create/Find Resources**
   - Gets or creates "Collections Campaign" for workspace
   - Gets or creates contact for payer
   - Gets or creates lead for send_queue
   - Gets workspace default inbox

6. **Queue Email**
   - Inserts into `send_queue` table
   - Creates reminder tracking record
   - Schedules send time (soft = next day 9 AM, others = immediate)

#### Helper Functions
- `getOrCreateCollectionsCampaign()` - Creates system campaign for collections
- `getOrCreateContact()` - Creates contact from payer info
- `getOrCreateLead()` - Creates lead for send_queue (handles schema variations)
- `renderTemplate()` - Renders template variables
- `formatCurrency()` - Formats money values
- `formatDate()` - Formats dates
- `stripHtml()` - Converts HTML to plain text

### 4️⃣ Cron Configuration (`vercel.json`)

Added daily cron job:
```json
{
  "path": "/api/cron/collections/process-overdue?key=${CRON_SECRET}",
  "schedule": "0 9 * * *"
}
```

Runs daily at 9 AM to process overdue invoices.

## 🔄 How It Works

### Automatic Sequence Selection

The system automatically escalates based on days overdue:

1. **Not Overdue (0 days)** → `soft` reminder
   - Friendly, casual tone
   - Scheduled for next business day 9 AM

2. **1-7 Days Overdue** → `professional` follow-up
   - Professional but firm tone
   - Sent immediately

3. **8-15 Days Overdue** → `firm` reminder
   - More urgent tone
   - Sent immediately

4. **15+ Days Overdue** → `final` notice
   - Final warning before escalation
   - Highest priority in send_queue
   - Sent immediately

### Payer Type Routing

- **Homeowner** invoices → Homeowner-specific templates
- **Insurance** invoices → Insurance adjuster templates (includes claim numbers)

### Duplicate Prevention

- Checks for reminders sent in last 3 days
- Prevents sending same level reminder multiple times
- Tracks escalation progression (never downgrades)

## 💰 Business Value

### For Roofers

1. **Faster Cash Collection**
   - Automated reminders mean faster payment
   - No manual follow-up needed
   - Professional tone protects reputation

2. **Better Cash Flow**
   - Consistent follow-up on overdue invoices
   - Reduces days sales outstanding (DSO)
   - More stable cash flow for crews and materials

3. **Time Savings**
   - No need to write collection emails
   - No need to track who needs reminders
   - Fully automated system

### For SmartSend

1. **Higher Retention**
   - Contractors don't cancel software that collects money
   - Collections automation = sticky feature
   - Justifies Growth ($199) and Domination ($399) plans

2. **Competitive Advantage**
   - Most roofing software doesn't have collections automation
   - This becomes a key differentiator
   - Roofers brag about this feature

## 📊 Database Tables

### `roofing_collections_playbooks`
- Stores email templates
- System templates (not user-editable by default)
- Indexed by payer_type and level

### `roofing_collection_reminders`
- Tracks sent reminders
- Links to invoices, playbooks, and send_queue
- Prevents duplicate sends
- Tracks escalation progression

## 🔐 Security & Permissions

- **RLS Enabled** on both tables
- **Playbooks:** Read-only for authenticated users (system templates)
- **Reminders:** Users can view reminders for invoices in their workspace
- **Service Role:** Full access for cron jobs

## 🚀 Next Steps / Future Enhancements

1. **User Customization**
   - Allow roofers to customize templates
   - Add custom variables
   - A/B test different templates

2. **Advanced Scheduling**
   - Respect timezone for send times
   - Skip weekends/holidays
   - Business hours only

3. **Payment Tracking**
   - Auto-detect payments and stop reminders
   - Link reminders to payment received events
   - Update invoice status automatically

4. **Analytics Dashboard**
   - Show collections performance
   - Track reminder effectiveness
   - Show payment recovery rates

5. **Multi-Channel**
   - Add SMS reminders
   - Add phone call reminders
   - Add in-app notifications

## ✅ Testing Checklist

- [x] Database migration runs successfully
- [x] Default playbooks inserted correctly
- [x] Functions compile and execute
- [x] API route handles authentication
- [x] Cron job configured in vercel.json
- [x] Template rendering works correctly
- [x] Duplicate prevention logic works
- [x] Escalation level selection works
- [x] Lead/contact creation handles schema variations
- [x] Send_queue integration works

## 📝 Notes

- The system integrates with existing `roofing_invoices` table from Block 26200
- Uses `roofing_invoice_balances` view for balance calculations
- Requires `send_queue` table from existing send queue system
- Requires `campaigns`, `contacts`, `leads`, and `inboxes` tables
- Handles schema variations across different migrations

---

**Block 26280 Implementation Complete** ✅

This block gives SmartSend elite collections automation that roofing companies NEVER want to write themselves. Professional, proven sequences that get people to PAY — without sounding aggressive or sloppy.



































