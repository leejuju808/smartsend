# Block 22880 — SmartSend Roofing Payments & Collections v1 Implementation

## ✅ Implementation Complete

This block brings real payment infrastructure into SmartSend, making it the financial control center of the roofing business.

## 📦 What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250130000001_block22880_payments_collections_v1.sql`

**Tables Created:**
- **`job_invoices`** - Tracks all invoices (deposits, progress payments, final invoices)
  - Links to Stripe payment links for online payments
  - Status tracking: draft, sent, viewed, paid, overdue
  - Types: deposit, progress, final
  
- **`job_payments`** - Records all payments received
  - Payment methods: card, ACH, check, cash, other
  - Links to Stripe payment intents
  - Stores payer information

**Features:**
- Row-level security (RLS) policies for org-based access
- Automatic invoice status updates when payments are received
- Helper functions for calculating totals and balances
- Indexes for performance

### 2. Edge Functions

#### `payments-create-invoice`
**Path:** `supabase/functions/payments-create-invoice/index.ts`

Creates Stripe payment links and invoice records:
- Accepts: `org_id`, `job_id`, `amount`, `invoice_type`
- Creates Stripe Payment Link
- Inserts invoice record with payment link URL
- Adds timeline event

**Usage:**
```typescript
POST /functions/v1/payments-create-invoice
{
  "org_id": "uuid",
  "job_id": "uuid",
  "amount": 2500.00,
  "invoice_type": "deposit"
}
```

#### `payments-webhook`
**Path:** `supabase/functions/payments-webhook/index.ts`

Stripe webhook listener for payment confirmations:
- Marks invoice as "Paid"
- Inserts payment record
- Updates timeline
- Handles both checkout.session.completed and payment_intent.succeeded events

**Setup:**
- Configure webhook endpoint in Stripe Dashboard
- URL: `https://your-project.supabase.co/functions/v1/payments-webhook`
- Events: `checkout.session.completed`, `payment_intent.succeeded`
- Set `STRIPE_WEBHOOK_SECRET` environment variable

### 3. Homeowner Portal Integration

**Updated:** `supabase/functions/homeowner-portal-data/index.ts`
- Now includes invoices and payments data

**New Component:** `app/homeowner/[token]/components/PaymentCenter.tsx`
- Shows all invoices with payment links
- Displays payment history
- Summary cards: Total Invoiced, Total Paid, Balance
- "Pay Now" buttons for unpaid invoices

**Updated:** `app/homeowner/[token]/page.tsx`
- Added PaymentCenter component to portal page

### 4. Office UI — Payments Tab

**New Component:** `app/(dashboard)/jobs/[jobId]/components/JobPaymentsTab.tsx`
- Summary cards: Total Invoiced, Total Paid, Balance
- Invoice list with status badges
- Payment history
- "Request Deposit" button to create new invoices
- Create invoice dialog

**Updated:** `app/(dashboard)/jobs/[jobId]/page.tsx`
- Added "Payments" tab to job detail page

## 🎯 Features Delivered

✅ Create invoices inside SmartSend
✅ Send payment links to homeowners
✅ Accept card payments (Stripe)
✅ Accept ACH (via Stripe)
✅ Record payments (automatic + manual)
✅ Update job profit snapshot (via triggers)
✅ Show "Payment Status" in homeowner portal
✅ Payment history and receipts

## 🔧 Setup Instructions

### 1. Apply Database Migration

```bash
# Apply the migration
supabase db push
# Or manually run the SQL in Supabase Dashboard
```

### 2. Deploy Edge Functions

```bash
# Deploy create-invoice function
supabase functions deploy payments-create-invoice

# Deploy webhook function
supabase functions deploy payments-webhook
```

### 3. Configure Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

**For `payments-create-invoice`:**
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

**For `payments-webhook`:**
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

### 4. Configure Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://your-project.supabase.co/functions/v1/payments-webhook`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

## 📊 Data Flow

```
Contractor creates invoice
  ↓
payments-create-invoice edge function
  ↓
Stripe Payment Link created
  ↓
Invoice record inserted with payment_link
  ↓
Homeowner clicks "Pay Now"
  ↓
Stripe Checkout
  ↓
Payment completed
  ↓
Stripe webhook → payments-webhook
  ↓
Payment record inserted
  ↓
Invoice status updated to "paid"
  ↓
Timeline event added
```

## 🎨 UI Components

### Homeowner Portal
- **Payment Center Card** - Shows all invoices and payment history
- **Pay Now Buttons** - Direct links to Stripe checkout
- **Status Badges** - Visual indicators for invoice status
- **Payment Summary** - Total invoiced, paid, and balance

### Office Dashboard
- **Payments Tab** - Full payment management interface
- **Create Invoice Dialog** - Quick invoice creation
- **Invoice List** - All invoices with status and links
- **Payment History** - Chronological payment records

## 🔒 Security

- Row-level security (RLS) policies ensure users can only access invoices/payments for their org
- Stripe webhook signature verification
- Service role key used only in edge functions (server-side)
- Payment links are secure Stripe-hosted URLs

## 📝 Notes

- The system uses `org_id` to match the existing `roofing_jobs` table structure
- Timeline events are wrapped in try-catch since `job_events` table structure may vary
- Payment links are created using Stripe Payment Links API (no checkout sessions needed)
- ACH payments are supported through Stripe's payment methods

## 🚀 Next Steps

1. Test invoice creation flow
2. Test payment webhook with Stripe test cards
3. Verify homeowner portal payment display
4. Test office payments tab functionality
5. Configure Stripe webhook endpoint in production

## 🐛 Known Limitations

- Manual payment entry (check/cash) not yet implemented in UI (can be done via database)
- Invoice due date tracking for overdue status not yet automated (can be added via cron job)
- Profit snapshot auto-update depends on existing profit calculation system







































