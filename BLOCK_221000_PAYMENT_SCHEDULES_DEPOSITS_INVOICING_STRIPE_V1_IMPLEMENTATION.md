# Block 221000 — SmartSend Roofing "Payment Schedules + Deposits + Invoicing Engine + Stripe Integration" v1

**IMPLEMENTATION COMPLETE ✅**

This block turns SmartSend from "nice tool" → "THIS THING PRINTS MONEY FOR ROOFERS."

## 🎯 Overview

When a contract is generated, SmartSend automatically builds:
- ✅ Payment Schedule (Deposit, Progress Payments, Final)
- ✅ Invoice Engine (Auto-create, auto-send, auto-track)
- ✅ Stripe Integration (Homeowner payments through SmartSend)
- ✅ Job Pipeline Update (Final payment → job completed)

## 📦 What Was Built

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block221000_payment_schedules_deposits_invoicing_stripe_v1.sql`

#### Tables Created:

1. **`payment_schedules`** - Payment schedules linked to contracts
   - `id`, `contract_id`, `job_id`, `workspace_id`, `company_id`, `homeowner_id`, `lead_id`
   - `total_amount`, `currency`, `schedule_type`, `status`
   - Links to contracts, jobs, homeowners, and leads

2. **`payment_milestones`** - Individual payment milestones
   - `id`, `schedule_id`, `label` (Deposit, Progress #1, Final, etc.)
   - `amount`, `percentage`, `due_date`
   - `status` (unpaid, paid, overdue, partial)
   - `paid_at`, `paid_amount`, `milestone_order`

3. **`stripe_transactions`** - Stripe payment transaction records
   - `id`, `invoice_id`, `milestone_id`, `schedule_id`
   - `stripe_payment_intent_id`, `stripe_charge_id`, `stripe_customer_id`
   - `amount`, `currency`, `status`
   - `payment_method_type`, `last4`, `raw_event_data`

4. **`company_stripe_keys`** - Company-specific Stripe configuration
   - `id`, `company_id`, `workspace_id`
   - `stripe_account_id`, `stripe_publishable_key`, `stripe_secret_key_encrypted`
   - `webhook_secret`, `webhook_endpoint_id`
   - `is_active`, `is_test_mode`

5. **`invoice_automation_log`** - Automation trigger log
   - `id`, `milestone_id`, `schedule_id`, `workspace_id`
   - `automation_type` (deposit_followup_24h, overdue_reminder, etc.)
   - `status` (pending, sent, failed, skipped)
   - `metadata`, `processed_at`

#### Extended Tables:

- **`invoices`** - Added `milestone_id` and `schedule_id` columns

#### Database Functions:

- `create_payment_schedule_from_contract()` - Creates schedule from contract with structure array
- `get_payment_schedule_summary()` - Returns schedule summary with milestone status
- `update_milestone_payment_status()` - Auto-updates milestone status on payment
- `check_final_payment_complete()` - Auto-updates job status when final payment received
- `check_deposit_followups()` - Checks for unpaid deposits 24h+ old
- `check_overdue_payments()` - Checks for overdue payments

#### Triggers:

- Auto-update milestone status when payment succeeds
- Auto-update job status to "completed" when final payment received
- Auto-update schedule status when all milestones paid

### 2. API Routes ✅

#### A. Payment Schedule Creation
**File:** `src/app/api/payments/schedule/create/route.ts`
- **POST** `/api/payments/schedule/create`
- Input: `{ contract_id, total_amount, structure: ["30", "40", "30"] }`
- Output: `{ schedule_id, schedule, milestones }`
- Creates payment schedule with customizable structure

#### B. Invoice Creation
**File:** `src/app/api/invoices/create/route.ts`
- **POST** `/api/invoices/create`
- Input: `{ milestone_id, invoice_number (optional) }`
- Output: `{ invoice_id, invoice, invoice_html }`
- Generates invoice HTML template

#### C. Invoice Sending
**File:** `src/app/api/invoices/send/route.ts`
- **POST** `/api/invoices/send`
- Input: `{ invoice_id, payment_link (optional) }`
- Output: `{ sent: true, sent_at, payment_link }`
- Sends invoice email to homeowner with payment link

#### D. Stripe Payment Intent
**File:** `src/app/api/stripe/create-intent/route.ts`
- **POST** `/api/stripe/create-intent`
- Input: `{ invoice_id }`
- Output: `{ client_secret, payment_intent_id }`
- Creates Stripe payment intent for invoice

#### E. Invoice Listing
**File:** `src/app/api/invoices/list/route.ts`
- **GET** `/api/invoices/list?schedule_id=...&job_id=...`
- Returns invoices with filters

#### F. Invoice Details
**File:** `src/app/api/invoices/[id]/route.ts`
- **GET** `/api/invoices/[id]`
- Returns single invoice with all related data

#### G. Payment Automations Cron
**File:** `src/app/api/cron/payment-automations/route.ts`
- **POST** `/api/cron/payment-automations`
- Processes automation triggers (deposit follow-ups, overdue reminders)
- Should be called hourly via cron job

### 3. Stripe Webhook Updates ✅

**File:** `src/app/api/webhooks/stripe/route.ts`

Updated to handle:
- Payment schedules and milestones
- `stripe_transactions` table records
- Auto-update milestone status on payment success
- Auto-update job status when final payment received

### 4. Frontend Components ✅

#### A. Payment Schedule Builder
**File:** `src/components/payments/PaymentScheduleBuilder.tsx`
- Auto-builds payment schedule from contract
- Editable percentage structure
- Add/remove milestones
- Real-time amount calculations
- Validates percentages sum to 100%

#### B. Invoices Dashboard
**File:** `src/components/payments/InvoicesDashboard.tsx`
- Lists all invoices with status
- Color-coded status (🟢 paid, 🟠 overdue, 🟡 pending)
- Send/Resend invoice buttons
- View invoice link
- Filters by schedule_id or job_id

#### C. Homeowner Payment Page
**File:** `src/app/pay/invoice/[id]/page.tsx`
- Beautiful branded payment checkout
- Stripe Elements integration
- Invoice details display
- Secure payment processing
- Success redirect

### 5. Automations ✅

#### Deposit Follow-up (24h)
- Trigger: Milestone unpaid 24+ hours after contract signed
- Action: Send email reminder with payment link
- Function: `check_deposit_followups()`

#### Overdue Payment Reminder
- Trigger: Milestone overdue (due_date < today)
- Action: Send urgent email reminder
- Function: `check_overdue_payments()`
- Frequency: Max once per week per milestone

#### Final Payment → Job Complete
- Trigger: Final milestone payment received
- Action: Update job status to "completed"
- Automatic via database trigger

## 🚀 Usage

### Creating a Payment Schedule

```typescript
// After contract is signed
const response = await fetch("/api/payments/schedule/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contract_id: contractId,
    total_amount: 15000,
    structure: ["30", "40", "30"], // 30% deposit, 40% progress, 30% final
  }),
});
```

### Generating and Sending Invoice

```typescript
// Create invoice for milestone
const invoiceResponse = await fetch("/api/invoices/create", {
  method: "POST",
  body: JSON.stringify({ milestone_id: milestoneId }),
});

// Send invoice to homeowner
const sendResponse = await fetch("/api/invoices/send", {
  method: "POST",
  body: JSON.stringify({ invoice_id: invoiceId }),
});
```

### Setting Up Cron Job

Add to your cron scheduler (e.g., Vercel Cron, Supabase Edge Functions):

```bash
# Run every hour
0 * * * * curl -X POST https://your-domain.com/api/cron/payment-automations \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 🔒 Security

- Row Level Security (RLS) enabled on all tables
- Workspace-based access control
- Service role has full access for webhooks
- Stripe webhook signature verification
- Encrypted Stripe keys (application-level encryption recommended)

## 📊 Database Relationships

```
contract_documents
  └── payment_schedules
        └── payment_milestones
              └── invoices
                    └── stripe_transactions
```

## 🎨 UI Integration Points

1. **After Contract Signing**: Show `PaymentScheduleBuilder` component
2. **Job Detail Page**: Show `InvoicesDashboard` component
3. **Homeowner Portal**: Link to `/pay/invoice/[id]` for payment

## 🔄 Automation Flow

1. Contract signed → Payment schedule created
2. Deposit milestone created → Invoice generated
3. Invoice sent → Homeowner receives email
4. 24h after contract → Deposit follow-up sent (if unpaid)
5. Payment received → Milestone status updated
6. Final payment received → Job status = "completed"
7. Overdue milestone → Urgent reminder sent (max once/week)

## ✅ Testing Checklist

- [ ] Create payment schedule from contract
- [ ] Generate invoice for milestone
- [ ] Send invoice email
- [ ] Process Stripe payment
- [ ] Verify milestone status updates
- [ ] Verify job status updates on final payment
- [ ] Test deposit follow-up automation
- [ ] Test overdue reminder automation
- [ ] Verify RLS policies
- [ ] Test payment page UI

## 🎯 Next Steps (Future Enhancements)

- [ ] SMS reminders for overdue payments
- [ ] Partial payment support
- [ ] Payment plan modifications
- [ ] Automated late fees
- [ ] Integration with accounting software
- [ ] Multi-currency support
- [ ] ACH payment support
- [ ] Payment receipt generation

## 📝 Notes

### Required Environment Variables

- `STRIPE_SECRET_KEY` - Stripe secret key for payment processing
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for frontend
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature secret
- `CRON_SECRET` - Secret for cron job authentication
- `FROM_EMAIL` - Email address for sending invoices
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - SMTP configuration (or use Resend/Gmail)

### Required Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "@stripe/stripe-js": "^2.0.0",
    "@stripe/react-stripe-js": "^2.0.0"
  }
}
```

### Security Notes

- Stripe keys should be encrypted at application level (not just in database)
- Use environment variables for all secrets
- Enable RLS on all tables
- Verify Stripe webhook signatures

### Future Enhancements

- Consider adding invoice PDF generation (using Puppeteer or similar)
- Add SMS reminders for overdue payments
- Support for payment plans and modifications

---

**This implementation makes SmartSend the end-to-end revenue system roofers DREAM of. 🚀**

























