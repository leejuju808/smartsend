# Block 21260 — SmartSend Roofing Revenue Forecast Brain v1 Implementation

## ✅ Implementation Complete

**Block 21260 turns SmartSend into a financial prediction engine for roofing companies.**

This block solves the critical problem roofers face: **they never know how much money is coming, which jobs are real, or which leads to prioritize.**

---

## 📦 What Was Implemented

### 1. Database Migration ✅
**File**: `supabase/migrations/20250202000001_block21260_revenue_forecast_brain_v1.sql`

#### A) `revenue_forecasts` Table
Stores complete revenue forecast calculations for every roofing job:
- **RCV Revenue**: Insurance-approved amount (base job value)
- **Supplement Revenue**: Predicted supplement value based on missing items, underpricing, O&P
- **Upsell Revenue**: Predicted upsell value (gutters, upgrades, add-ons)
- **Install Probability**: Closing likelihood (0-100%)
- **TRUE Job Value**: RCV + Supplement + Upsell (actual money roofer will make)
- **Breakdowns & Insights**: Detailed JSONB data for UI display

#### B) Calculation Functions

**`calculate_rcv_revenue(p_thread_id)`**
- Pulls RCV from scope_comparisons (priority 1), insurance_attachments (priority 2), or thread data
- Returns RCV, ACV, deductible, depreciation

**`calculate_supplement_revenue(p_thread_id)`**
- Analyzes scope_comparisons for missing items, underpricing, quantity mismatches, O&P
- Calculates total supplement opportunity
- Builds insights array for UI display

**`calculate_upsell_revenue(p_thread_id)`**
- Predicts upsell potential based on:
  - Home value (from zip code)
  - Roof size (squares)
  - Proposal behavior (views, engagement)
  - Homeowner questions
- Calculates gutters, upgraded shingles, ventilation, ridge vent opportunities

**`calculate_install_probability(p_thread_id)`**
- Uses install-ready score as base
- Adds behavior signals (proposal views, homeowner replies)
- Factors in insurance status (approved, ACV only)
- Checks deductible confirmation
- Returns 0-100% probability with category (cold/warm/hot/very_hot)

**`calculate_revenue_forecast_v1(p_thread_id, p_force_recalculate)`**
- Main function that orchestrates all calculations
- Caches results (1 hour TTL)
- Returns complete forecast JSON

**`get_revenue_forecast_panel(p_thread_id)`**
- Returns forecast data formatted for UI display
- Auto-calculates if no forecast exists

**`get_revenue_dashboard_forecast(p_workspace_id, p_days_ahead)`**
- Aggregates forecast data for dashboard
- Returns monthly projection, pipeline value, pending supplements, high-value leads
- Groups jobs by probability category

#### C) Auto-Update Triggers
- **`trg_recalculate_forecast_on_scope_comparison`**: Recalculates when scope comparison is updated
- **`trg_recalculate_forecast_on_install_ready`**: Recalculates when install-ready score or insurance status changes

### 2. API Endpoints ✅

#### A) Revenue Forecast Endpoint
**File**: `app/api/contacts/[id]/revenue-forecast/route.ts`

**GET** `/api/contacts/[id]/revenue-forecast`
- Returns revenue forecast for a contact
- Auto-calculates if missing

**POST** `/api/contacts/[id]/revenue-forecast`
- Forces recalculation of forecast
- Body: `{ forceRecalculate: boolean }`

#### B) Integration with Roofing Card API
**File**: `app/api/contacts/[id]/roofing-card/route.ts`

Added `revenueForecast` field to response:
- Includes all forecast data formatted for UI
- Auto-calculates if missing

### 3. UI Components ✅

#### A) Revenue Forecast Panel
**File**: `components/contacts/roofing/sections/RevenueForecastPanel.tsx`

**Features:**
- Displays RCV Revenue, Supplement Revenue, Upsell Revenue
- Shows TRUE Job Value prominently
- Shows Install Probability with color-coded badges
- Displays key insights:
  - Supplement opportunities (missing items, O&P, etc.)
  - Upsell opportunities (gutters, upgrades, etc.)
  - Install probability signals (why this score)
- Refresh button to recalculate
- Empty states for missing data

**Design:**
- Full-width card with gradient header
- Color-coded sections (blue for RCV, green for supplements, purple for upsells)
- Large TRUE Job Value display
- Badge for install probability category

#### B) Integration with Roofing Contact Card
**File**: `components/contacts/roofing/RoofingContactCard.tsx`

- Added Revenue Forecast Panel at top of card (after Next Best Action)
- Full-width display for maximum visibility
- Auto-refreshes when data changes

### 4. Revenue Dashboard Integration ✅

**File**: `supabase/migrations/20250201000003_block20650_roofing_revenue_dashboard_v1.sql`

Updated `get_roofing_revenue_dashboard()` function to include:
- `revenueForecastBrain` field with:
  - Monthly revenue projection (weighted by install probability)
  - Pipeline value (sum of TRUE job values)
  - Pending supplements total
  - High-value leads count
  - Jobs grouped by probability category

---

## 🎯 Key Features

### 1️⃣ RCV Revenue (Insurance-Approved Amount)
- Pulls from Attachment Analyzer (21020)
- Uses Scope Comparison (21080) data
- Falls back to Insurance Timeline (21050) data
- Displays base job value

### 2️⃣ Supplement Revenue (Expected Add-Ons)
- Predicts supplements based on:
  - Missing items (steep charge, drip edge, ice & water, etc.)
  - Underpricing discrepancies
  - Quantity corrections
  - O&P missing value
- Formula: `missing_items + quantity_corrections + o_and_p + pricing_discrepancies`
- Shows detailed breakdown in UI

### 3️⃣ Upsell Revenue (Roofing Add-Ons)
- Predicts based on:
  - Home value (from zip code)
  - Roof size (squares)
  - Proposal behavior (views, engagement)
  - Homeowner questions
- Possible upsells:
  - Gutters
  - Upgraded shingles
  - Ventilation improvement
  - Ridge vent upgrade
- Weighted by probability

### 4️⃣ Install Probability % (Closing Likelihood)
- Uses install-ready score (21110) as base
- Adds behavior signals:
  - Proposal views
  - Homeowner replies
  - Engagement level
- Factors in insurance status:
  - Claim approved: +20 points
  - ACV approved: +15 points
  - Deductible confirmed: +15 points
- Categories:
  - 0-25%: Cold lead
  - 26-50%: Warm lead
  - 51-75%: Hot
  - 76-100%: Very hot/ready

### 5️⃣ TRUE Job Value (Final Output)
- Formula: `RCV + Supplement + Upsell`
- This is the actual revenue the roofer should expect
- Displayed prominently in UI
- Used for pipeline value calculations

---

## 🔄 Auto-Update Logic

Forecasts automatically recalculate when:
1. **Scope comparison is updated** (new attachment analyzed, supplement detected)
2. **Install-ready score changes** (homeowner behavior, insurance status)
3. **Insurance claim status changes** (approved, denied, etc.)

Forecasts are cached for 1 hour to avoid excessive calculations.

---

## 📊 Dashboard Integration

The Revenue Dashboard (20650) now includes:
- **Monthly Revenue Projection**: Sum of TRUE job values weighted by install probability
- **Pipeline Value**: Sum of all TRUE job values
- **Pending Supplements**: Total supplement opportunity across all jobs
- **High-Value Leads**: Jobs with TRUE value > $20k and install probability > 50%
- **Jobs by Probability**: Breakdown by category (very_hot/hot/warm/cold)

---

## 🎨 UI Display

### Revenue Forecast Panel Layout:
```
┌─────────────────────────────────────────────────┐
│ Revenue Forecast (SmartSend v1)        [↻]     │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Insurance RCV]  [Supplement]  [Upsell]      │
│     $18,200         +$4,480      +$850        │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 💰 TRUE Job Value: $23,530             │   │
│  │ 🔥 Install Probability: 82% (Very Hot) │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Supplement Opportunities:                     │
│  ✓ Missing steep charge: +$1,400              │
│  ✓ Missing drip edge: +$550                   │
│  ✓ O&P not included: +$2,850                  │
│                                                 │
│  Upsell Opportunities:                         │
│  ⚠ Gutter replacement: +$1,200 (60% chance)   │
│                                                 │
│  Why This Score?                                │
│  ℹ Claim approved (+20 pts)                    │
│  ℹ Homeowner opened proposal 3 times (+15)   │
│  ℹ Deductible confirmed (+15 pts)            │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Usage

### For Roofers:
1. Open any contact card
2. See Revenue Forecast Panel at top
3. View TRUE Job Value and Install Probability
4. See supplement and upsell opportunities
5. Use install probability to prioritize leads

### For Owners:
1. View Revenue Dashboard
2. See monthly revenue projection
3. See pipeline value (sum of TRUE job values)
4. See pending supplements total
5. Identify high-value leads to prioritize

---

## 🔗 Integration Points

- **Attachment Analyzer (21020)**: Provides scope comparison data
- **Scope Comparison Engine (21080)**: Provides supplement opportunities
- **Install-Ready Predictor (21110)**: Provides install probability base score
- **Revenue Dashboard (20650)**: Displays aggregated forecast data
- **Roofing Contact Card (20710)**: Displays forecast panel

---

## 📈 Impact

This feature:
- ✅ Shows roofers EXACTLY how much money is coming
- ✅ Predicts which jobs will close (install probability)
- ✅ Identifies supplement opportunities automatically
- ✅ Highlights upsell potential
- ✅ Prioritizes high-value, high-probability leads
- ✅ Powers revenue dashboard with accurate projections

**This is the feature owners brag about.**
**This is the feature that gets SmartSend DEMO SIGN-UPS.**
**This is REAL $$$ for the user.**

---

## 🧪 Testing

To test:
1. Create a contact with insurance claim data
2. Upload insurance attachment (triggers scope comparison)
3. View contact card → Revenue Forecast Panel should appear
4. Check TRUE Job Value calculation
5. Verify install probability calculation
6. Check dashboard for aggregated data

---

## 📝 Notes

- Forecasts are cached for 1 hour
- Auto-recalculates when relevant data changes
- Falls back gracefully if data is missing
- UI shows helpful empty states
- All calculations are done server-side for accuracy

---

**Block 21260 Complete** ✅
















































