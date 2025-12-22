# Block 20360 — SmartSend Inbox Homeowner Insurance Brain v1 Implementation

## 🎯 Mission

Turn SmartSend into a weapon for roofing contractors by automatically analyzing ANY email from a homeowner and instantly telling the roofer:

- ✅ Which insurance company the homeowner has
- ✅ Whether they are in Active Claim / Pending Claim / No Claim
- ✅ What their deductible is
- ✅ Whether the homeowner is install-ready
- ✅ Whether SmartSend should trigger a call, a follow-up, or a quote

**This is DIRECT revenue logic for roofers. This is how SmartSend books jobs automatically.**

---

## ✅ Implementation Complete

### 1. Database Migration (`20250130000002_block20360_insurance_brain_v1.sql`)

**Added Fields to `inbox_threads`:**
- `insurance_carrier` - Detected carrier (State Farm, Allstate, Farmers, etc.)
- `insurance_claim_status` - Claim status (no_claim_filed, claim_filed_awaiting_adjuster, adjuster_visit_scheduled, under_review, approved, approved_acv_only, supplements_needed, denied)
- `insurance_deductible_amount` - Deductible amount in dollars
- `insurance_deductible_type` - Type: fixed, percentage, or unknown
- `insurance_deductible_percentage` - Percentage value (e.g., 2.0 for 2%)
- `insurance_payout_type` - RCV, ACV, or unknown
- `insurance_depreciation_recoverable` - Whether recoverable depreciation is available
- `insurance_depreciation_amount` - Amount of recoverable depreciation
- `insurance_install_ready` - Whether homeowner is install-ready (THE MONEY MAKER)
- `insurance_next_action` - Recommended action: call_immediately, send_follow_up, send_quote, wait_for_adjuster, prepare_supplement, none
- `insurance_analysis_metadata` - JSONB with confidence scores, detected keywords, reasoning
- `insurance_analyzed_at` - Timestamp when analysis was performed
- `insurance_last_updated_at` - Timestamp when data was last updated

**Database Features:**
- Indexes for fast queries on carrier, claim status, install-ready status
- View `inbox_install_ready_leads` for revenue priority filtering
- Function `get_insurance_summary()` returns 7-tag output format
- Trigger `trg_queue_insurance_analysis` auto-marks threads for analysis when inbound messages arrive

### 2. Supabase Edge Function (`insurance-brain-v1/index.ts`)

**Core Detection Logic:**

**A) Carrier Detection**
- Identifies: State Farm, Allstate, Farmers, Liberty Mutual, Progressive, Travelers, USAA, Nationwide, Geico
- Falls back to "Unknown Carrier (needs confirmation)" if insurance mentioned but carrier unclear
- Uses AI + keyword matching for accuracy

**B) Claim Status Detection**
- Classifies into 8 statuses:
  - `no_claim_filed` - No claim yet
  - `claim_filed_awaiting_adjuster` - Claim filed, waiting for adjuster
  - `adjuster_visit_scheduled` - Adjuster visit scheduled
  - `under_review` - Claim under review
  - `approved` - Claim approved (full RCV)
  - `approved_acv_only` - Approved but ACV only
  - `supplements_needed` - Supplements required
  - `denied` - Claim denied

**C) Deductible Extraction**
- Extracts dollar amounts: "$1,000 deductible", "Deductible is $2500"
- Handles percentages: "2% deductible", "Deductible is 2%"
- Converts 2% to percentage type with flag for homeowner input if home value not provided

**D) ACV / RCV Logic**
- Determines payout type: RCV (full replacement) vs ACV (depreciated)
- Detects recoverable depreciation availability
- Extracts depreciation amount

**E) Install-Ready Detection (The Money Maker)**
Homeowner is INSTALL READY if ALL of these are true:
- ✔ Claim approved (status = approved or approved_acv_only)
- ✔ Deductible known (amount or percentage is not null)
- ✔ Scope of work included OR they ask for next steps OR they confirm roof type OR storm damage acknowledged
- ✔ They ask for scheduling OR next steps

**F) Next Action Recommendation**
- `call_immediately` - If install-ready = true
- `send_follow_up` - If claim filed but not approved
- `send_quote` - If no claim but interested
- `wait_for_adjuster` - If adjuster scheduled
- `prepare_supplement` - If supplements needed
- `none` - Otherwise

**AI Analysis:**
- Uses GPT-4o-mini for intelligent extraction
- Returns structured JSON with confidence scores
- Includes detected keywords and reasoning
- Processes email subject, body, and attachments

**PDF Attachment Support:**
- Detects PDF attachments in messages
- Ready for PDF text extraction (TODO: integrate PDF parsing service)
- Notes PDF presence in analysis metadata

### 3. API Endpoint (`/api/inbox/insurance-brain`)

**GET `/api/inbox/insurance-brain?thread_id=xxx`**
- Returns the 7-tag insurance summary for a thread
- Includes all insurance fields and metadata
- Uses database function `get_insurance_summary()` for consistency

**POST `/api/inbox/insurance-brain`**
- Triggers insurance analysis for a thread or message
- Body: `{ thread_id?: string, message_id?: string }`
- Calls the `insurance-brain-v1` Edge Function
- Returns analysis results

### 4. Auto-Analysis Trigger

**Database Trigger:**
- `trg_queue_insurance_analysis` fires on INSERT to `inbox_messages`
- Only processes inbound messages (`direction = 'in'`)
- Marks thread for analysis by setting `insurance_analyzed_at = NULL`
- Separate worker can pick up threads needing analysis

---

## 📊 The 7-Tag Output (What the Contractor Sees)

Every email generates:

```json
{
  "insurance_carrier": "State Farm",
  "claim_status": "approved",
  "deductible": 1000,
  "payout_type": "RCV",
  "depreciation_recoverable": true,
  "install_ready": true,
  "next_action": "call_immediately"
}
```

Clean. Simple. Powerful.

---

## 🔄 Integration Points

### Email Processing Flow

1. **Inbound Email Arrives**
   - Email stored in `inbox_messages` table
   - Trigger `trg_queue_insurance_analysis` fires
   - Thread marked for analysis (`insurance_analyzed_at = NULL`)

2. **Insurance Analysis**
   - Worker or manual API call triggers `insurance-brain-v1` Edge Function
   - Function analyzes email content (subject, body, attachments)
   - AI extracts insurance information
   - Results stored in `inbox_threads` table

3. **Contractor Views Thread**
   - API returns 7-tag insurance summary
   - UI displays install-ready status, next action, etc.
   - Contractor knows exactly what to do

### Manual Trigger

```typescript
// Trigger analysis for a thread
const response = await fetch('/api/inbox/insurance-brain', {
  method: 'POST',
  body: JSON.stringify({ thread_id: 'xxx' })
});

// Get insurance summary
const summary = await fetch('/api/inbox/insurance-brain?thread_id=xxx');
```

---

## 🚀 How This Helps Roofing Companies

Roofers waste hours every week reading emails from homeowners trying to figure out:

- ❓ Do they have insurance?
- ❓ Is the claim approved?
- ❓ What's the deductible?
- ❓ Are they ready to install?
- ❓ Should I call them or follow up?
- ❓ Should I send a quote?
- ❓ Does this job have profit or not?

**SmartSend Insurance Brain v1 solves ALL of that automatically.**

It turns their inbox into:
- 🔹 An insurance-aware lead manager
- 🔹 A claim status assistant
- 🔹 A deductible calculator
- 🔹 An install-ready detector
- 🔹 A revenue prioritization engine

Contractors get instant clarity on every homeowner email → and SmartSend books jobs automatically.

---

## 📁 Files Created/Modified

### Database
- `supabase/migrations/20250130000002_block20360_insurance_brain_v1.sql`

### Edge Functions
- `supabase/functions/insurance-brain-v1/index.ts`

### API Routes
- `app/api/inbox/insurance-brain/route.ts`

### Documentation
- `BLOCK_20360_INSURANCE_BRAIN_V1_IMPLEMENTATION.md`

---

## 🧪 Testing

### Test Scenarios

1. **State Farm Claim Approved**
   - Email: "I have State Farm insurance, claim approved, $1,000 deductible, ready to schedule"
   - Expected: carrier = "State Farm", claim_status = "approved", deductible = 1000, install_ready = true, next_action = "call_immediately"

2. **2% Deductible**
   - Email: "Deductible is 2%"
   - Expected: deductible_type = "percentage", deductible_percentage = 2.0, deductible_amount = null

3. **ACV Only**
   - Email: "Insurance said they'll pay ACV only, $8,000"
   - Expected: payout_type = "ACV", claim_status = "approved_acv_only"

4. **Awaiting Adjuster**
   - Email: "I filed a claim, adjuster is coming next week"
   - Expected: claim_status = "adjuster_visit_scheduled", next_action = "wait_for_adjuster"

5. **Install-Ready Detection**
   - Email: "Claim approved, deductible is $1,500, when can you install?"
   - Expected: install_ready = true, next_action = "call_immediately"

---

## 🔮 Future Enhancements

### v2 Features (Future)
- Full PDF text extraction from claim documents
- Photo analysis for damage detection
- Integration with insurance carrier APIs
- Automated supplement submission
- Real-time adjuster tracking
- Insurance carrier-specific rules
- Multi-claim support
- Claim history tracking

---

## ✅ Status: READY FOR TESTING

All components of Block 20360 — SmartSend Inbox Homeowner Insurance Brain v1 have been successfully implemented:

- ✅ Database migration with all insurance fields
- ✅ Carrier detection (9 major carriers + fallback)
- ✅ Claim status classification (8 statuses)
- ✅ Deductible extraction (fixed + percentage)
- ✅ ACV/RCV detection
- ✅ Install-ready intelligence
- ✅ Next action recommendation
- ✅ AI-powered analysis via Edge Function
- ✅ API endpoints (GET + POST)
- ✅ Auto-analysis trigger
- ✅ PDF attachment support (ready for integration)

**This makes SmartSend undeniably valuable, especially for roofers who live off insurance claims.**
















































