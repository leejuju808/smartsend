# Block 21020 — SmartSend Attachment Analyzer v2 Implementation

## ✅ Implementation Complete

**Block 21020 makes SmartSend's insurance brain go from strong → ELITE.**

Attachment Analyzer v2 turns SmartSend into a full insurance-grade scope auditor. This is exactly what roofing companies pay supplementing firms $100–$400/job for. Now we build it directly into SmartSend.

---

## 📦 What Was Implemented

### 1. Database Schema ✅
**File**: `supabase/migrations/20250201000002_block21020_attachment_analyzer_v2.sql`

#### Tables Created:

**A) `carrier_line_item_mappings`**
- Maps carrier-specific line item names to normalized categories
- Supports carriers: State Farm, Allstate, USAA, Farmers, Nationwide
- Normalized categories: `ridge_cap`, `drip_edge`, `ice_water`, `starter_course`, `ridge_vent`, `steep_charge`
- Pre-populated with common carrier variants

**B) `scope_comparisons`**
- Stores detailed comparison between Insurance Scope and SmartSend AI Estimate
- Fields:
  - Insurance financials (RCV, ACV, deductible, depreciation)
  - SmartSend estimate totals
  - RCV difference and underpayment amount
  - Missing line items (JSONB array)
  - Underpriced line items (JSONB array)
  - Quantity mismatches (JSONB array)
  - O&P analysis results
  - Code items missing
  - Supplement opportunity breakdown
  - Supplement types (AI-classified)

**C) `code_item_requirements`**
- Stores code requirements (IRC + local rules)
- Pre-populated with:
  - Drip edge (IRC R905.2.8.5)
  - Ice & water shield (IRC R905.1.1)
  - Ridge vent (IRC R806.2)
  - Starter course (IRC R905.2.5)
  - Underlayment (IRC R905.1.1)
  - Valley metal (IRC R905.2.6)
  - Step flashing (IRC R903.2)
  - Nail pattern (IRC R905.2.7)

**D) `o_and_p_detection_rules`**
- Carrier-specific O&P detection rules
- Pre-populated for: State Farm, Allstate, USAA, Farmers, Nationwide
- Rules include:
  - Multiple trades requirement (typically 3+)
  - Justification rules (steep roof, 2-story, hazardous conditions)
  - Auto-deny flags
  - Standard O&P percentage (20%)

#### Extended Tables:

**`inbox_threads`** (new columns):
- `scope_comparison_id` - Link to detailed comparison
- `supplement_opportunity_total` - Quick access to supplement value
- `rcv_underpayment` - RCV underpayment amount
- `o_and_p_missing` - O&P missing flag
- `o_and_p_missing_value` - O&P missing value
- `code_conflicts_detected` - Code conflicts flag

### 2. Database Functions ✅

**A) `normalize_line_items(p_line_items, p_carrier_name)`**
- Normalizes carrier-specific line items to SmartSend standard categories
- Uses carrier mapping dictionary
- Returns JSONB with normalized categories

**B) `detect_missing_code_items(p_roof_scope, p_material_type, p_pitch, p_climate_zone)`**
- Detects missing code-required items based on IRC and local rules
- Checks against roof scope line items
- Returns JSONB array of missing items with code references

**C) `detect_o_and_p_status(p_insurance_scope, p_carrier_name, p_roof_scope, p_insurance_rcv)`**
- Detects O&P status with carrier-specific rules
- Checks if O&P is included
- Determines if O&P should be included
- Calculates missing O&P value
- Builds justification text
- Returns JSONB with analysis results

**D) `compare_insurance_vs_smartsend_scope(p_thread_id, p_insurance_attachment_id, p_roof_estimate_id, p_carrier_name)`**
- Main comparison engine
- Compares Insurance Scope vs SmartSend Estimate
- Calculates supplement opportunities
- Stores results in `scope_comparisons` table
- Updates thread with comparison results
- Returns comparison ID

### 3. Edge Function ✅
**File**: `supabase/functions/attachment-analyzer-v2/index.ts`

**Features:**
- Accepts `thread_id`, `insurance_attachment_id`, `roof_estimate_id`, `carrier_name`
- Automatically finds insurance attachment if not provided
- Generates SmartSend estimate if not available
- Uses AI (OpenAI GPT-4o-mini) for detailed scope comparison
- Falls back to database function comparison if AI unavailable
- Stores results in `scope_comparisons` table
- Updates thread with comparison results

**AI Comparison Capabilities:**
- Missing line items detection
- Underpriced items detection
- Quantity mismatch detection
- Supplement opportunity calculation
- Supplement type classification

### 4. Auto-Trigger System ✅

**Trigger**: `trg_queue_attachment_analyzer_v2`
- Automatically runs v2 analysis when v1 parsing completes
- Only triggers for `ESTIMATE_SCOPE` documents
- Calls edge function asynchronously
- Fire-and-forget pattern (doesn't block v1 completion)

### 5. API Integration ✅
**File**: `app/api/contacts/[id]/roofing-card/route.ts`

**Updates:**
- Fetches scope comparison v2 data
- Includes v2 analysis in scope response
- Provides quick access to supplement opportunities
- Includes O&P and code conflict flags

### 6. UI Components ✅
**File**: `components/contacts/roofing/sections/ScopePanel.tsx`

**New Features:**
- Displays v2 scope analysis section
- Shows RCV comparison (Insurance vs SmartSend)
- Highlights underpayment amount
- Displays total supplement opportunity with breakdown
- Shows missing line items with estimated values
- Shows underpriced items
- Shows quantity mismatches
- Displays O&P analysis with justification
- Shows code conflicts with code references
- Displays supplement types as badges
- Fallback display for quick stats when v2 analysis not available

---

## 🎯 Key Features

### 1. Advanced Line-Item Mapping (Carrier-Specific)
- Maps carrier-specific names to normalized categories
- Supports multiple carriers with their naming conventions
- Extensible mapping system

### 2. Scope Comparison Engine
- Compares Insurance Scope vs SmartSend AI Estimate
- Calculates RCV difference
- Identifies underpayment amount
- Detects missing items
- Detects underpriced items
- Detects quantity mismatches

### 3. O&P Detection
- Carrier-specific O&P rules
- Detects if O&P is included
- Determines if O&P should be included
- Calculates missing O&P value
- Builds justification text

### 4. Code Item Identification
- IRC code references
- Local rule support
- Material-specific requirements
- Climate zone considerations
- Automatic detection of missing code items

### 5. Supplement Opportunity Engine
- Calculates total supplement opportunity
- Breaks down by category:
  - Steep charge missing
  - Drip edge missing
  - Ice & water missing
  - Ridge vent missing
  - O&P missing
  - Pricing disputes
  - Other

### 6. Supplement Classifications (AI)
- Pricing dispute
- Missing safety items
- Missing code items
- Line item mismatch
- Under-measured quantities
- O&P missing
- Carrier exclusions wrong

---

## 🔄 Data Flow

1. **Insurance Attachment Parsed (v1)**
   - Block 20380 parses PDF attachment
   - Extracts financials, roof scope, profitability signals
   - Updates `insurance_attachments` table

2. **Auto-Trigger v2 Analysis**
   - Trigger fires when v1 parsing completes
   - Calls `attachment-analyzer-v2` edge function
   - Passes `thread_id` and `insurance_attachment_id`

3. **v2 Analysis Execution**
   - Edge function fetches insurance attachment data
   - Gets or generates SmartSend estimate
   - Performs AI-powered comparison
   - Calls database functions for O&P and code items
   - Stores results in `scope_comparisons` table
   - Updates thread with comparison results

4. **UI Display**
   - Contact Card API fetches scope comparison data
   - ScopePanel component displays v2 analysis
   - Shows supplement opportunities, missing items, O&P, code conflicts

---

## 📊 Example Output

```json
{
  "scopeAnalysisV2": {
    "insuranceRcv": 18200,
    "smartsendEstimateTotal": 22680,
    "rcvDifference": 4480,
    "underpaymentAmount": 4480,
    "totalSupplementOpportunity": 6070,
    "missingLineItems": [
      {
        "category": "steep_charge",
        "description": "Steep charge (32 SQ)",
        "qty": 32,
        "unit": "SQ",
        "estimated_value": 1400
      },
      {
        "category": "drip_edge",
        "description": "Drip edge (250 LF)",
        "qty": 250,
        "unit": "LF",
        "estimated_value": 550
      }
    ],
    "oAndP": {
      "included": false,
      "shouldBeIncluded": true,
      "missingValue": 2850,
      "justification": "Multiple trades (4) require general contractor coordination."
    },
    "codeItemsMissing": [
      {
        "item": "drip_edge",
        "code_reference": "IRC R905.2.8.5",
        "description": "Drip edge required at eaves and rakes",
        "estimated_value": 550
      }
    ],
    "supplementBreakdown": {
      "steep_charge_missing": 1400,
      "drip_edge_missing": 550,
      "ice_water_missing": 820,
      "o_and_p_missing": 2850,
      "total": 5620
    },
    "supplementTypes": [
      "missing_code_items",
      "o_and_p_missing",
      "line_item_mismatch"
    ]
  }
}
```

---

## 🚀 Usage

### Manual Trigger
```typescript
// Call edge function directly
POST /functions/v1/attachment-analyzer-v2
{
  "thread_id": "uuid",
  "insurance_attachment_id": "uuid", // optional
  "roof_estimate_id": "uuid", // optional
  "carrier_name": "State Farm" // optional
}
```

### Automatic Trigger
- Automatically runs when v1 parsing completes
- No manual intervention needed
- Results available in Contact Card UI

---

## 🔗 Integration Points

### Block 20360 — Insurance Brain
- Receives supplement opportunities
- Updates insurance analysis with v2 data

### Block 20490 — AI Estimator
- Uses SmartSend estimate for comparison
- Can trigger v2 analysis after estimate generation

### Block 20590 — Adjuster Engine
- Uses supplement opportunities for email generation
- Includes missing items in adjuster emails

### Block 20650 — Revenue Dashboard
- Displays supplement opportunities
- Shows underpayment amounts

### Block 20710 — Contact Card
- Displays v2 scope analysis
- Shows supplement opportunities prominently

### Block 20680 — Activity Feed
- Logs v2 analysis completion
- Records supplement opportunities found

---

## 📈 Impact

**For Roofing Companies:**
- Find missing money automatically
- Identify supplement opportunities instantly
- See exactly what insurance owes
- Generate supplement-ready reports
- Save $100–$400 per job (no supplementing firm needed)

**Example:**
- Insurance RCV: $18,200
- SmartSend Estimate: $22,680
- Underpayment: $4,480
- Supplement Opportunity: +$6,070
- **Total Additional Revenue: $6,070 per job**

---

## 🎉 Summary

Block 21020 transforms SmartSend from a basic scope parser into a full insurance-grade scope auditor. Roofers now have:

1. ✅ Advanced line-item mapping (carrier-specific)
2. ✅ Scope comparison engine (Insurance vs SmartSend)
3. ✅ O&P detection with carrier rules
4. ✅ Code item identification (IRC + local)
5. ✅ RCV/ACV breakdown extraction
6. ✅ Supplement opportunity engine
7. ✅ Supplement classifications (AI)
8. ✅ Beautiful UI display in Contact Card
9. ✅ Automatic analysis after v1 parsing
10. ✅ Integration with all related blocks

**This is REAL MONEY for roofers, and they will LOVE SmartSend for this.**
















































