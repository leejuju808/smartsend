# Block 39200 — SmartSend Roofing "Invoice Engine + Payments & Collections System" v1

## Implementation Summary

This block implements a complete invoice and payment system for SmartSend Roofing, enabling roofers to:
- Auto-generate invoices when jobs are completed
- Accept payments via Stripe (Card + ACH)
- Automatically send payment reminders
- Track payment history and balances
- Generate PDF invoices
- Sync with job costing/profit engine

## Database Schema

### New Tables
1. **invoice_events** - Tracks all invoice lifecycle events (created, sent, viewed, reminder_sent, paid, overdue)
2. **invoice_payment_reminders** - Schedules and tracks payment reminders (Day 1, 3, 7, 14)

### Extended Tables
1. **invoices** - Added fields:
   - `roofing_job_id` - Links to roofing_jobs table
   - `lead_id` - Links to leads table
   - `balance_due` - Calculated balance after payments
   - `pdf_url` - URL to generated PDF
   - `stripe_payment_intent_id` - Stripe payment intent ID
   - `sent_at`, `viewed_at`, `last_reminder_sent_at`, `reminder_count` - Tracking fields

### Database Functions
1. **auto_generate_invoice_on_job_completion()** - Trigger function that creates invoice when job status = 'completed'
2. **calculate_invoice_balance()** - Calculates and updates invoice balance based on payments
3. **update_invoice_on_payment()** - Trigger function that updates invoice status when payment is received
4. **mark_overdue_invoices()** - Marks invoices as overdue based on due date
5. **schedule_payment_reminders()** - Schedules payment reminders for an invoice

## API Routes

### Invoice Management
- `POST /api/invoices/generate` - Manually generate invoice for a job
- `GET /api/invoices/[id]/pay` - Get invoice details for payment page (public)
- `POST /api/invoices/[id]/view` - Track invoice view (public)
- `GET /api/invoices/[id]/pdf` - Generate and return invoice PDF

### Payment Processing
- `POST /api/invoices/[id]/payment-intent` - Create Stripe payment intent for invoice

### Webhooks
- Enhanced `/api/webhooks/stripe` to handle:
  - `payment_intent.succeeded` - Record payment and update invoice
  - `payment_intent.payment_failed` - Log payment failure

### Cron Jobs
- `GET /api/cron/invoice-reminders` - Sends payment reminders (Day 1, 3, 7, 14)
  - Requires `CRON_SECRET` in Authorization header
  - Processes pending reminders
  - Sends SMS via Vonage/Twilio
  - Marks invoices as overdue if needed

## UI Components

### Public Pages
- `/pay/[id]` - Customer payment page
  - Displays invoice details
  - Stripe Elements payment form (Card + ACH)
  - Payment history
  - Download PDF button

### Components (To Be Created)
- `InvoicePanel` - Component for job detail pages showing:
  - Invoice list
  - Payment timeline
  - Balance tracker
  - Generate invoice button
  - Download PDF links

## Features Implemented

### ✅ Auto-Generate Invoice on Job Completion
- Trigger automatically creates invoice when `roofing_jobs.status` = 'completed'
- Calculates total including change orders
- Subtracts deposit already paid
- Sends SMS to homeowner with payment link
- Schedules payment reminders

### ✅ Stripe Payment Integration
- Creates payment intent with Card + ACH support
- Customer payment page with Stripe Elements
- Webhook handler records payments
- Updates invoice balance automatically
- Syncs with job costing

### ✅ Auto Payment Reminders
- Scheduled reminders at Day 1, 3, 7, 14
- SMS sent via Vonage/Twilio
- Escalates to overdue status at Day 14
- Tracks reminder count and last sent date

### ✅ Invoice PDF Generator
- Generates HTML invoice (can be converted to PDF)
- Includes job details, line items, change orders
- Shows payment history
- Includes payment link QR code

### ✅ Payment Tracking
- Real-time balance calculation
- Payment history timeline
- Invoice events log
- Status updates (pending → partially_paid → paid)

### ✅ Sync with Job Costing
- Updates `roofing_jobs.deposit_paid` when payment received
- Triggers profit recalculation
- Updates revenue dashboard

## Setup Instructions

### 1. Database Migration
Run the migration:
```bash
supabase migration up 20250203000000_block39200_invoice_engine_payments_collections_v1
```

### 2. Environment Variables
Ensure these are set:
- `STRIPE_SECRET_KEY` - Stripe secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `VONAGE_SMS_URL` - Vonage SMS API URL (or configure in workspace_settings)
- `CRON_SECRET` - Secret for cron job authentication
- `NEXT_PUBLIC_SITE_URL` - Base URL for payment links

### 3. Install Dependencies
```bash
npm install @stripe/react-stripe-js
```

### 4. Configure Stripe Webhook
Add webhook endpoint in Stripe Dashboard:
- URL: `https://yourdomain.com/api/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

### 5. Set Up Cron Job
Configure cron to call:
```
GET https://yourdomain.com/api/cron/invoice-reminders
Authorization: Bearer YOUR_CRON_SECRET
```

Recommended schedule: Every hour

## Usage

### For Roofers

1. **Auto Invoice Generation**
   - When a job is marked as "completed", invoice is automatically created
   - Invoice includes job value + change orders - deposit paid
   - Homeowner receives SMS with payment link

2. **Manual Invoice Generation**
   - Call `POST /api/invoices/generate` with `job_id` and optional `invoice_type`
   - Invoice types: `deposit`, `progress`, `final`, `change_order`

3. **View Invoices**
   - Access invoices via job detail page (component to be added)
   - View payment timeline and balance
   - Download PDF invoices

### For Homeowners

1. **Receive Invoice**
   - SMS with payment link: `https://yourdomain.com/pay/[invoice_id]`
   - Email invoice (if configured)

2. **Pay Invoice**
   - Visit payment page
   - Enter payment details (Card or ACH)
   - Payment processed via Stripe
   - Receipt displayed

3. **Payment Reminders**
   - Automatic reminders at Day 1, 3, 7, 14
   - Escalates to overdue at Day 14

## Future Enhancements

1. **PDF Generation**
   - Currently returns HTML, can be enhanced with Puppeteer or PDFKit
   - Add QR code for payment link
   - Add company logo and branding

2. **Email Invoices**
   - Send invoice via email in addition to SMS
   - Email templates with branding

3. **Partial Payments**
   - Allow homeowners to pay partial amounts
   - Track multiple payments per invoice

4. **Financing Integration**
   - Add financing options to payment page
   - Integrate with financing providers

5. **Invoice Templates**
   - Customizable invoice templates
   - Company branding

6. **Past Due Alerts**
   - Notify contractor when invoice is overdue
   - Dashboard alerts for overdue invoices

## Testing

### Test Invoice Generation
```bash
curl -X POST http://localhost:3000/api/invoices/generate \
  -H "Content-Type: application/json" \
  -d '{"job_id": "YOUR_JOB_ID", "invoice_type": "final"}'
```

### Test Payment Intent
```bash
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/payment-intent \
  -H "Content-Type: application/json"
```

### Test Payment Reminders
```bash
curl -X GET http://localhost:3000/api/cron/invoice-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Notes

- Invoice auto-generation is triggered by database trigger, so it works even if API is down
- Payment reminders are processed in batches (100 at a time)
- SMS sending requires Vonage or Twilio configuration in workspace_settings
- PDF generation currently returns HTML; can be enhanced with PDF library
- All invoice events are logged for audit trail
































