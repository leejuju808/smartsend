# Block 220000 — SmartSend Roofing "Estimates → Proposals → Digital Contracts → E-Sign → Job Pipeline" Implementation

## ✅ Implementation Complete

This block makes every roofer feel STUPID not using SmartSend because it takes their most painful choke point — turning leads into signed jobs — and makes it instant, professional, and automatic.

**This is the moment SmartSend stops being "a cold email tool" and becomes a revenue weapon.**

## 📦 What Was Built

### 1. Database Migration ✅

**File:** `supabase/migrations/20250230000000_block220000_estimates_proposals_contracts_esign.sql`

#### Tables Created:

**A) `estimates` Table**
- Stores estimates with line items (JSONB), subtotal, tax, total
- Links to `roofing_companies` and `homeowners`
- Status: draft, sent, approved, declined
- Auto-calculated totals via helper function

**B) `estimates_proposals` Table**
- Branded proposals generated from estimates
- HTML content, theme selection (classic, premium, insurance)
- Photo support, expiration dates
- Public token for secure sharing
- View tracking (viewed_at, viewed_count)

**C) `estimates_contracts` Table**
- Digital contracts with legal terms
- E-signature support (base64 signature storage)
- Payment schedules, warranty info
- Public token for signing
- Status: awaiting_signature, signed, declined, void

**D) `estimates_job_links` Table**
- Auto-links contracts to jobs when signed
- Supports both `roofing_jobs` and `jobs` tables
- Tracks auto-creation flag

**E) `proposal_views` Table**
- Tracks every proposal view with IP and user agent
- Used for analytics and notifications

**F) `proposal_followups` Table**
- Tracks follow-up emails sent
- Prevents duplicate follow-ups

#### Features:
- Row Level Security (RLS) policies for secure access
- Database triggers for automatic job creation when contract is signed
- Proposal view tracking and notifications
- Helper function: `calculate_estimate_totals()` for auto-calculations
- Helper function: `check_pending_proposals_48h()` for follow-up automation

### 2. API Routes ✅

#### Estimates
- **POST `/api/estimates/create`** - Create estimate with line items
- **GET `/api/estimates/list`** - List all estimates for user's companies
- **GET `/api/estimates/[id]`** - Get estimate by ID

#### Proposals
- **POST `/api/proposals/generate`** - Generate branded proposal from estimate
- **POST `/api/proposals/send`** - Send proposal to homeowner via email
- **GET `/api/proposals/view?token=xxx`** - Public proposal viewing with tracking
- **GET `/api/proposals/[id]`** - Get proposal by ID

#### Contracts
- **POST `/api/contracts/create`** - Convert proposal to contract
- **POST `/api/contracts/sign`** - E-sign contract (public endpoint)
- **GET `/api/contracts/by-proposal/[id]`** - Get contract by proposal ID
- **GET `/api/contracts/public/[token]`** - Get public contract by token

#### Jobs
- **POST `/api/jobs/from-contract`** - Manually create job from contract (auto-triggered by DB)

#### Automations
- **POST `/api/automations/proposal-followup`** - Send 48-hour follow-up emails (cron job)

### 3. Frontend Pages ✅

#### A) Estimates Dashboard
**File:** `src/app/dashboard/estimates/page.tsx`

**Features:**
- Homeowner search with autocomplete
- Add/remove line items dynamically
- Auto-calculate totals (subtotal, tax, total)
- Save estimates as drafts
- List all estimates with status
- Convert to proposal with one click

#### B) Proposal Builder
**File:** `src/app/dashboard/estimates/[id]/proposal/page.tsx`

**Features:**
- Theme selection (classic, premium, insurance)
- Photo upload support
- Expiration date setting
- Live preview
- Generate and send proposal

#### C) Contract Page
**File:** `src/app/dashboard/proposals/[id]/contract/page.tsx`

**Features:**
- Convert proposal to contract
- Add terms & conditions, scope of work, warranty
- Payment schedule configuration
- Share contract link
- View contract status

#### D) Public Proposal Viewing
**File:** `src/app/proposals/[token]/page.tsx`

**Features:**
- Public-facing proposal page
- Automatic view tracking
- Beautiful HTML rendering

#### E) Public Contract Signing
**File:** `src/app/contracts/[token]/page.tsx`

**Features:**
- Canvas-based signature capture
- Name and email collection
- Contract HTML display
- Success confirmation
- Auto-creates job when signed

### 4. Automations ✅

#### A) Proposal Viewed Notification
- Trigger: When proposal is viewed (via `proposal_views` table)
- Action: Notifies contractor (via database function)
- Implementation: Database trigger `trg_notify_proposal_viewed`

#### B) Contract Signed → Job Creation
- Trigger: When contract status changes to "signed"
- Action: Automatically creates job in `roofing_jobs` table
- Implementation: Database trigger `trg_contract_signed`
- Creates job link in `estimates_job_links` table

#### C) 48-Hour Follow-up Email
- Trigger: Proposals pending for 48+ hours
- Action: Sends AI follow-up email to homeowner
- Implementation: API route `/api/automations/proposal-followup` (call via cron)
- Prevents duplicate follow-ups via `proposal_followups` table

## 🎯 User Flow

1. **Create Estimate**
   - Contractor searches for homeowner
   - Adds line items (material, quantity, unit price)
   - Auto-calculates totals
   - Saves as draft

2. **Generate Proposal**
   - Selects theme (classic/premium/insurance)
   - Adds photos (optional)
   - Sets expiration date
   - Generates branded HTML proposal

3. **Send Proposal**
   - Contractor sends proposal link to homeowner
   - Homeowner views proposal (tracked automatically)
   - Contractor gets notified when viewed

4. **Convert to Contract**
   - Contractor adds terms, scope, warranty
   - Generates legal contract
   - Shares contract link with homeowner

5. **E-Sign Contract**
   - Homeowner views contract
   - Signs using canvas signature
   - Provides name and email
   - Contract marked as signed

6. **Auto-Create Job**
   - Database trigger automatically creates job
   - Job status: "unscheduled"
   - Job value set from contract total
   - Job link created in `estimates_job_links`

7. **Follow-up Automation**
   - If proposal not approved in 48 hours
   - System sends follow-up email
   - Prevents duplicate emails

## 🔒 Security

- Row Level Security (RLS) on all tables
- Public tokens for secure sharing (no authentication required for viewing/signing)
- Company ownership verification on all API routes
- Signature data stored securely (base64 encoded)

## 📊 Database Schema Summary

```
estimates
  ├── id, company_id, homeowner_id, created_by
  ├── line_items (JSONB), subtotal, tax_rate, tax, total
  └── notes, status, created_at, updated_at

estimates_proposals
  ├── id, estimate_id
  ├── proposal_html, theme, photos (JSONB)
  ├── valid_until, status, viewed_at, viewed_count
  └── public_token, created_at, updated_at

estimates_contracts
  ├── id, proposal_id
  ├── contract_html, terms_and_conditions, scope_of_work
  ├── payment_schedule (JSONB), warranty, insurance_docs (JSONB)
  ├── homeowner_signature, signature_date, signed_by_name, signed_by_email
  ├── status, requires_signature
  └── public_token, created_at, updated_at

estimates_job_links
  ├── id, contract_id
  ├── job_id, job_table ('roofing_jobs' | 'jobs')
  └── auto_created, created_at

proposal_views
  ├── id, proposal_id
  └── viewed_at, ip_address, user_agent

proposal_followups
  ├── id, proposal_id
  ├── sent_at, followup_type
  └── created_at
```

## 🚀 Next Steps (BLOCK 221000)

When you return, implement:
- **Payment Schedules + Deposits + Invoice Engine**
- Stripe integration for deposit collection
- Progress invoices
- Final payment tracking
- Full wiring into contracts

## 💡 Why This Makes Roofers Feel Dumb Not Using It

**Before SmartSend:**
- ❌ Still sending PDFs
- ❌ Still handwriting estimates
- ❌ Still chasing signatures
- ❌ Still losing jobs because homeowners forget
- ❌ Still using 3–4 different tools

**With SmartSend:**
- ✅ Clean branded estimates
- ✅ Premium proposals that close jobs
- ✅ Digital contracts that sign instantly
- ✅ E-sign built-in
- ✅ Auto flow into job pipeline
- ✅ All-in-one system
- ✅ No tech learning needed

**Result:** Every roofer using SmartSend is closing more jobs than competitors. That's how you dominate.

























