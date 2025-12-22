# Block 21080 — SmartSend Scope Comparison Engine v2
## Implementation Summary

This block transforms SmartSend into something INSURANCE ADJUSTERS fear and roofing companies love by providing a comprehensive three-way comparison engine (Insurance Scope vs SmartSend AI Estimate vs Real Market Pricing) with carrier bias detection and detailed underpayment analysis.

## ✅ Completed Features

### 1. Database Schema (`20250202000001_block21080_scope_comparison_engine_v2.sql`)

#### Enhanced `scope_comparisons` Table
- **Market Pricing Fields**: Added `market_price_total` and `market_rcv` for market baseline comparison
- **Three-Way Comparison Totals**: 
  - `difference_insurance_vs_smartsend`
  - `difference_insurance_vs_market`
  - `difference_smartsend_vs_market`
- **Underpayment Breakdown**:
  - `missing_items_total`
  - `underpriced_items_total`
  - `quantity_errors_total`
  - `o_and_p_missing_total`
- **Line Item Comparisons**: JSONB array storing three-way comparison per normalized line item
- **Human-Friendly Summary**: JSONB object with readable summary for roofers
- **Carrier Bias Detection**: JSONB object storing detected carrier bias patterns

#### Carrier Bias Patterns Table
- **`carrier_bias_patterns`** table tracks patterns of underpayment by carrier and line item
- Stores statistics: omission rates, underpricing rates, average underpayment amounts
- Supports regional analysis (by region/zip code)
- Enables pre-built supplement arguments and carrier-personalized emails

### 2. Database Functions

#### `compare_line_items_three_way()`
- Performs three-way price comparison per normalized line item
- Compares Insurance price vs SmartSend price vs Market price
- Returns detailed comparison array with differences and underpayment amounts

#### `calculate_underpayment_breakdown()`
- Calculates detailed underpayment breakdown:
  - Missing items total
  - Underpriced items total
  - Quantity errors total
  - O&P missing total
- Returns comprehensive breakdown JSONB

#### `detect_carrier_bias()`
- Detects carrier-specific bias patterns from line item comparisons
- Returns bias patterns with omission rates and descriptions
- Example: "State Farm typically omits steep charge in 82% of claims"

#### `update_carrier_bias_patterns()`
- Updates carrier bias pattern statistics after each comparison
- Maintains running averages and rates
- Enables pattern recognition over time

#### `generate_human_friendly_summary()`
- Generates human-readable summary showing where insurance missed money
- Creates clear list of missing items, underpricing, and O&P issues
- Format: "Missing steep charge", "Underpriced ridge cap", "O&P not included"

#### `compare_insurance_vs_smartsend_vs_market_v2()` (Main Engine)
- Enhanced comparison function with three-way pricing
- Integrates all v2 features:
  - Market pricing lookup
  - Three-way line item comparison
  - Underpayment breakdown calculation
  - Carrier bias detection
  - Human-friendly summary generation
- Updates carrier bias patterns automatically

### 3. Edge Function Updates (`supabase/functions/attachment-analyzer-v2/index.ts`)

- Updated to use `compare_insurance_vs_smartsend_vs_market_v2()` function
- Falls back to v1 comparison if v2 fails
- Includes zip code and workspace ID for market pricing lookup
- Returns v2 fields: market pricing, line item comparisons, carrier bias, human summary

### 4. API Endpoint (`app/api/inbox/threads/[id]/scope-comparison/route.ts`)

#### GET Endpoint
- Returns comprehensive scope comparison data
- Includes three-way totals, underpayment breakdown, line item comparisons
- Returns carrier bias patterns and human-friendly summary
- Handles cases where no comparison exists

#### POST Endpoint
- Triggers comparison generation
- Automatically finds insurance attachment and roof estimate
- Calls v2 comparison function
- Returns created comparison data

### 5. UI Component (`components/contacts/roofing/sections/ScopeComparisonPanel.tsx`)

#### Features
- **Underpayment Summary**: Large, prominent display of total underpayment
- **Three-Way Comparison Totals**: Side-by-side display of Insurance RCV, SmartSend Estimate, Market Value
- **Underpayment Breakdown**: Detailed breakdown by category (missing items, underpricing, quantity errors, O&P)
- **Where Insurance Missed Money**: Human-friendly list of issues
- **Line Item Comparisons**: Detailed comparison table showing per-item differences
- **Carrier Bias Detection**: Displays detected bias patterns with statistics
- **O&P Status**: Clear indication of O&P inclusion status and missing value
- **Refresh Button**: Allows manual refresh of comparison data

#### Visual Design
- Color-coded sections (red for underpayment, green for included items, yellow for bias patterns)
- Badges for quick value scanning
- Responsive grid layout
- Scrollable line item list for long comparisons

## 🔄 Integration Points

### Feeds Into Other SmartSend Components

1. **Block 20590 — Adjuster Email Engine**
   - Auto-builds supplement request emails
   - Includes line-item comparison arguments
   - Uses carrier bias patterns for personalized arguments

2. **Block 20650 — Revenue Dashboard**
   - Adds supplement dollars as "money on table"
   - Shows underpayment totals in revenue forecasting

3. **Block 20710 — Contact Card**
   - Shows TRUE job value, not just RCV
   - Displays underpayment prominently
   - Integrates ScopeComparisonPanel component

4. **Block 20990 — Reply Classification**
   - Gains context for price disputes
   - Uses comparison data to classify supplement-related replies

5. **Block 21050 — Timeline Engine**
   - Adds supplement request/approval events
   - Tracks underpayment detection timeline

6. **Block 20620 — CRM Pipeline**
   - Moves job to "Underpayment / Supplement Needed" stage
   - Updates pipeline based on comparison results

## 📊 Example Output

### Human-Friendly Summary
```
Insurance vs Real Roof Cost Summary

Insurance RCV: $18,200
SmartSend Estimate: $22,680
Market Value: $21,950

Insurance Underpayment: $4,480
Supplement Opportunity: $7,590

Where Insurance Missed Money:
- Missing steep charge
- Missing drip edge
- Missing ice & water shield
- Underpriced ridge cap
- Underpriced shingle install labor
- O&P not included
- Wrong LF measurement for ridge
```

### Line Item Comparison Table
```
Item              Insurance  SmartSend  Market    Underpayment
Steep Charge      $0         $1,400     $1,250    +$1,400
Drip Edge         $0         $550       $530      +$550
Ice & Water       $0         $820       $780      +$820
Starter Strip     $180       $280       $260      +$100
Ridge Cap         $300       $450       $420      +$150
```

### Carrier Bias Pattern
```
State Farm typically underpays:
- Steep charges (82% of claims)
- Drip edge (65%)
- Ridge vent labor (73%)
```

## 🎯 Key Benefits

1. **Automatic Detection**: No manual comparison needed
2. **Three-Way Validation**: Insurance vs SmartSend vs Market pricing
3. **Carrier Intelligence**: Learns carrier-specific patterns over time
4. **Clear Communication**: Human-friendly summaries for roofers
5. **Supplement Arguments**: Pre-built arguments based on detected issues
6. **Revenue Recovery**: Identifies thousands in missed revenue per job

## 🚀 Usage

### Automatic Trigger
- Comparison runs automatically when insurance attachment is parsed (via trigger in Block 21020)
- Updates when new estimates are generated

### Manual Trigger
- Call POST `/api/inbox/threads/[threadId]/scope-comparison`
- Or click "Generate Comparison" button in UI

### View Results
- GET `/api/inbox/threads/[threadId]/scope-comparison`
- Or view in Contact Card → Scope Comparison Panel

## 📝 Database Migration

Run migration:
```sql
-- File: supabase/migrations/20250202000001_block21080_scope_comparison_engine_v2.sql
```

This migration:
- Extends `scope_comparisons` table with v2 fields
- Creates `carrier_bias_patterns` table
- Adds all comparison functions
- Sets up RLS policies

## 🔍 Testing

1. Upload insurance scope PDF
2. Wait for parsing (Block 20380)
3. Wait for v2 analysis (Block 21020)
4. Check scope comparison results
5. Verify carrier bias patterns are updated
6. View in Contact Card UI

## 📚 Related Blocks

- **Block 20380**: Insurance Attachment Parser v1
- **Block 21020**: Attachment Analyzer v2
- **Block 20490**: Roofing AI Estimator v1
- **Block 21050**: Claim Timeline Engine

## 🎉 Summary

Block 21080 transforms SmartSend into the ultimate insurance scope auditor, automatically detecting underpayments, tracking carrier bias patterns, and providing clear, actionable insights that help roofing companies recover thousands in missed revenue per job.

This is something NO competitor offers.
















































