# Block 241000 — SmartSend Roofing Supplier Hub v1 Implementation

## 🎯 Mission

**"Supplier Hub v1 — Material Orders, Delivery Tracking, Vendor Sync, Cost Control"**

This block connects SmartSend to the SUPPLY CHAIN. It transforms SmartSend from a CRM into a complete production & cost control powerhouse by handling:

- Digital Purchase Orders (POs)
- Supplier Profiles
- Material Order Templates
- Delivery Scheduling & Tracking
- Delivery Confirmation (crew capture)
- Cost Reconciliation
- Supplier Invoice Upload
- Material Variance Detection
- SMS/Email supplier notifications
- Future API sync (ABC, Beacon, SRS)

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250230000001_block241000_supplier_hub_v1.sql`

#### Core Tables Created:

**A) Enhanced `suppliers` Table**
- Extended existing suppliers table with Supplier Hub fields
- Fields: `address`, `delivery_hours`, `lead_time_days`, `rating`
- Supports both `roofing_companies` and `companies` table references

**B) `purchase_orders` Table**
- Digital Purchase Orders with auto-generated PO numbers (PO-YYYY-XXXX format)
- Status workflow: `pending` → `sent` → `confirmed` → `delivered` → `verified`
- Fields: `po_number`, `total_cost`, `delivery_date`, `delivery_window`, `pdf_url`
- Links to company, job, and supplier

**C) `po_items` Table**
- Items on each purchase order
- Fields: `material_name`, `qty`, `unit`, `price`, `total_price` (computed)
- Supports units: bundles, squares, rolls, pieces, sqft, linear_ft

**D) `deliveries` Table**
- Delivery tracking and confirmation
- Fields: `delivered_at`, `delivered_by`, `delivery_photos`, `drop_location`, `notes`
- Auto-updates PO status when delivery is logged

**E) `material_verification` Table**
- Crew verification step for delivered materials
- Fields: `verified`, `verified_at`, `discrepancies` (JSONB), `verification_photos`
- Links to crew and PO

**F) `supplier_invoices` Table**
- Supplier invoices for reconciliation
- Fields: `invoice_number`, `invoice_url`, `amount`, `po_amount`, `variance`, `variance_percent`
- Auto-calculates variance vs PO cost
- Reconciliation tracking: `reconciled`, `reconciled_at`

**G) `material_order_templates` Table**
- Reusable material order templates
- Fields: `name`, `description`, `items` (JSONB)
- For common job types (e.g., "Standard Shingle Reroof", "Metal Roof")

#### Key Features:
- ✅ RLS policies for multi-tenant security
- ✅ Auto-generated PO numbers
- ✅ Auto-calculated totals via triggers
- ✅ Status workflow automation
- ✅ Helper functions for reconciliation

### 2. API Routes ✅

#### Supplier Management
- **GET** `/api/suppliers` - List suppliers (with PO counts)
- **POST** `/api/suppliers` - Create supplier

#### Purchase Orders
- **GET** `/api/supplier/po` - List purchase orders (with filters: company_id, job_id, supplier_id, status)
- **GET** `/api/supplier/po/[po_id]` - Get single PO with full details
- **PATCH** `/api/supplier/po/[po_id]` - Update PO
- **POST** `/api/supplier/po/create` - Create new PO
- **POST** `/api/supplier/po/send` - Send PO to supplier (generate PDF + email/SMS)
- **POST** `/api/supplier/po/confirm` - Confirm delivery time
- **POST** `/api/supplier/po/verify` - Crew delivery verification

#### Invoices & Reconciliation
- **POST** `/api/supplier/invoice/upload` - Upload supplier invoice
- **POST** `/api/supplier/reconcile` - Reconcile costs for job or PO

**Files:**
- `app/api/suppliers/route.ts` (updated)
- `app/api/supplier/po/route.ts`
- `app/api/supplier/po/[po_id]/route.ts`
- `app/api/supplier/po/create/route.ts`
- `app/api/supplier/po/send/route.ts`
- `app/api/supplier/po/confirm/route.ts`
- `app/api/supplier/po/verify/route.ts`
- `app/api/supplier/invoice/upload/route.ts`
- `app/api/supplier/reconcile/route.ts`

### 3. UI Components ✅

#### Supplier Hub Main Page
**File:** `app/(dashboard)/supplier-hub/page.tsx`

Features:
- Supplier list table with PO counts, lead times, delivery hours, ratings
- Quick actions: Create PO, View POs
- Add/edit supplier dialog
- Links to Purchase Orders and Reconciliation dashboards

#### Purchase Orders List
**File:** `app/(dashboard)/supplier-hub/purchase-orders/page.tsx`

Features:
- Table view of all POs with filters
- Status badges
- Quick actions: View, Create PO
- Links to PO detail and creation

#### PO Builder Screen
**File:** `app/(dashboard)/supplier-hub/purchase-orders/create/page.tsx`

Features:
- Form to select supplier, job, delivery date/window
- Items table with add/remove functionality
- Real-time total cost calculation
- Support for multiple units (bundles, squares, rolls, pieces, sqft)
- Create PO button

#### PO Detail View
**File:** `app/(dashboard)/supplier-hub/purchase-orders/[po_id]/page.tsx`

Features:
- Full PO details with status and cost summary
- Tabs: Items, Delivery, Verification, Invoices
- Send to supplier button (for pending POs)
- Download PDF button
- Display delivery confirmation and crew verification
- Show supplier invoices with variance calculations

#### Reconciliation Dashboard
**File:** `app/(dashboard)/supplier-hub/reconciliation/page.tsx`

Features:
- Job ID input to reconcile costs
- Cost comparison tiles:
  - Estimated Cost
  - PO Total Cost
  - Invoice Total
  - Variance (amount and %)
- Visual indicators for significant variances (>5%)
- Color-coded variance display (red for over, green for under)

## 🔄 Next Steps (Future Implementation)

### 1. Automations (TODO)

These automations should be implemented via database triggers, edge functions, or background jobs:

- ✅ **When job signed → auto-create PO draft**
  - Trigger already exists in migration (block 223000)
  - Can be enhanced to use Supplier Hub PO system

- ⏳ **When materials needed → notify supplier**
  - Background job to check for pending POs
  - Send email/SMS to supplier

- ⏳ **24 hours before delivery → notify crew**
  - Cron job or scheduled function
  - Check PO delivery dates and send notifications

- ⏳ **When delivery arrives → crew prompted to verify**
  - Push notification to crew app
  - Email/SMS to crew leader

- ⏳ **If discrepancy found → auto-create issue ticket**
  - Trigger when material_verification.discrepancies is non-empty
  - Create ticket in issues/tasks system

- ⏳ **When invoiced cost > PO cost → flag variance**
  - Trigger on supplier_invoices insert/update
  - Send alert to owner/manager

- ⏳ **Update job profitability automatically**
  - Recalculate job profit when invoice is uploaded
  - Update jobs table or separate profitability table

- ⏳ **Auto-sync supplier invoice to accounting**
  - Integration with QuickBooks, Xero, etc.
  - Export invoice data on reconciliation

### 2. AI Features (TODO)

These AI features can be added via OpenAI/Anthropic integrations:

- ⏳ **AI predicts material quantities**
  - Based on job type, square footage, roof type
  - Suggest quantities when creating PO

- ⏳ **AI detects missing items in PO**
  - Compare PO items to estimate/job materials
  - Alert if common materials are missing

- ⏳ **AI writes supplier communication emails**
  - Generate professional PO emails
  - Draft follow-up messages

- ⏳ **AI analyzes job → suggests material templates**
  - Match job characteristics to templates
  - Auto-populate PO from template

- ⏳ **AI detects cost anomalies**
  - Flag unusual price changes
  - Detect potential errors in invoices

- ⏳ **AI flags waste patterns in crews**
  - Analyze material usage vs job specs
  - Identify crews with high waste

- ⏳ **AI forecasts material shortages during storms**
  - Weather-based demand prediction
  - Suggest bulk ordering before storms

### 3. PDF Generation (TODO)

**Current:** Placeholder PDF URL  
**Needed:** Actual PDF generation

Options:
- Use Puppeteer to convert HTML to PDF
- Use `@react-pdf/renderer` for React-based PDFs
- Use `pdfkit` for programmatic PDF creation
- Use a service like PDFShift, HTMLPDF

The PO PDF should include:
- Company header/logo
- PO number and date
- Supplier info
- Job info (if applicable)
- Items table with quantities, prices, totals
- Delivery date and instructions
- Notes

### 4. Email/SMS Notifications (TODO)

**Current:** Placeholder in `/api/supplier/po/send`  
**Needed:** Actual email/SMS sending

Options:
- Use Postmark/SendGrid for email
- Use Twilio for SMS
- Use Resend for transactional emails
- Integrate with existing notification system

Notifications needed:
- Send PO to supplier (email with PDF attachment)
- SMS confirmation to supplier
- 24-hour delivery reminder to crew
- Variance alerts to owner
- Delivery confirmation requests

### 5. Crew App Integration (TODO)

**Current:** API endpoint exists for verification  
**Needed:** Mobile-optimized UI for crews

Create:
- Mobile page/component for delivery verification
- Photo upload interface
- Discrepancy reporting form
- Offline support

### 6. Supplier API Sync (Future)

- ABC Supply API integration
- Beacon API integration
- SRS Distribution API integration
- Generic supplier portal scraping/webhook support

## 📋 Usage Guide

### Creating a Purchase Order

1. Navigate to `/supplier-hub`
2. Click "Create PO" or go to `/supplier-hub/purchase-orders/create`
3. Select supplier from dropdown
4. Optionally link to a job
5. Set delivery date and window
6. Add items (material name, quantity, unit, price)
7. Review total cost
8. Click "Create PO"

### Sending PO to Supplier

1. Go to PO detail page
2. Click "Send to Supplier" button
3. System generates PDF and sends via email/SMS
4. PO status changes to "sent"

### Verifying Delivery (Crew)

1. Crew receives notification when delivery arrives
2. Access verification form (mobile-optimized)
3. Take photos of delivered materials
4. Check items received vs PO items
5. Report any discrepancies
6. Submit verification

### Uploading Supplier Invoice

1. Go to PO detail page → Invoices tab
2. Click "Upload Invoice"
3. Upload PDF/image of invoice
4. Enter invoice number and amount
5. System calculates variance automatically
6. Alerts if variance > threshold

### Reconciling Costs

1. Navigate to `/supplier-hub/reconciliation`
2. Enter job ID
3. Click "Reconcile"
4. View cost comparison:
   - Estimated vs PO vs Actual Invoice
   - Variance amount and percentage
   - Flags for significant variances

## 🎯 Success Metrics

After full implementation, roofers should experience:

- ✅ **Zero missing material incidents** (verified delivery prevents this)
- ✅ **Complete PO tracking** (know exactly what was ordered, when, and cost)
- ✅ **Accurate job profitability** (real costs vs estimates)
- ✅ **Supplier accountability** (digital trail of all orders)
- ✅ **Faster ordering** (templates and auto-suggestions)
- ✅ **Cost control** (variance alerts prevent budget overruns)

## 🚀 Deployment Checklist

- [ ] Run migration: `supabase migration up`
- [ ] Verify RLS policies are active
- [ ] Test API routes with authenticated requests
- [ ] Test UI components in staging
- [ ] Set up PDF generation service
- [ ] Configure email/SMS service
- [ ] Test notification flows
- [ ] Train users on PO workflow
- [ ] Monitor for errors in production

## 📝 Notes

- The system is designed to work alongside existing `supplier_orders` from block 223000
- Supports both `roofing_companies` and `companies` table structures
- PO numbers are auto-generated but can be overridden
- All monetary values stored as `numeric(12,2)` for precision
- JSONB fields used for flexible data (photos, discrepancies, template items)
- Material verification is optional but recommended for quality control

---

**Status:** Core functionality complete ✅  
**Next:** Automations, AI features, PDF generation, notifications ⏳

























