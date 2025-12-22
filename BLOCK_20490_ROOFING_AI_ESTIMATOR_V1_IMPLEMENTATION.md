# Block 20490 — SmartSend Roofing AI Estimator v1
## Implementation Summary

This block implements an instant roofing estimate generator that turns every parsed roof scope into a real, ready-to-send roofing estimate.

## ✅ Completed Features

### 1. Database Schema (`20250201000001_block20490_roofing_ai_estimator_v1.sql`)

#### Market Pricing Dataset
- **`market_pricing_dataset`** table stores national default pricing (upgradable to zip-code pricing)
- Base installation rates: $350–$550 per square (default $425)
- Steep charge: $30–$50 per square (default $45)
- 2-story charge: $10–$20 per square (default $15)
- Material costs: decking, ridge vent, ice & water shield, drip edge, starter

#### Contractor Estimate Preferences
- Extended `contractor_pricing` table with:
  - `desired_profit_margin` (default 20%)
  - `markup_on_materials`
  - `include_o_and_p_automatically`
  - `o_and_p_percent`

#### Roof Estimates Tables
- **`roof_estimates`** table stores detailed estimate breakdowns
- **`roof_estimate_line_items`** table stores individual line items
- Links to parsed roof scope from Block 20380
- Stores insurance comparison data
- Tracks supplement opportunities

### 2. Database Functions

#### `get_market_pricing(p_zip_code, p_workspace_id)`
- Gets market pricing for a zip code
- Falls back to national default if zip-code pricing not available
- Returns pricing data as JSONB

#### `calculate_roof_estimate(p_thread_id, p_workspace_id, p_roof_scope, p_claim_financials, p_profitability_signals, p_zip_code)`
- Main function to calculate roofing estimate from parsed scope
- Uses market pricing, contractor preferences, insurance financials
- Generates detailed line items breakdown
- Detects missing items for supplements
- Returns complete estimate JSON with:
  - Price breakdown (base, steep, 2-story, materials)
  - Calculated total and final bid price (with profit margin)
  - Insurance comparison
  - Supplement recommendations

### 3. Edge Function (`supabase/functions/roofing-ai-estimator-v1/index.ts`)

- Generates estimates automatically when roof scope is parsed
- Validates that roof scope exists (requires Block 20380)
- Calls database function to calculate estimate
- Saves estimate and line items to database
- Generates estimate document text (MVP version)
- Returns complete estimate with insurance comparison and supplements

### 4. API Endpoint (`app/api/inbox/estimates/generate-roofing/route.ts`)

- **POST `/api/inbox/estimates/generate-roofing`**
- Authenticated endpoint for manual estimate generation
- Validates thread and parsed scope
- Calls edge function to generate estimate
- Returns estimate data

### 5. Frontend Component (`components/inbox/GenerateRoofingEstimateButton.tsx`)

- React component for triggering estimate generation
- Shows loading state during generation
- Handles errors (including missing parsed scope)
- Calls API endpoint and handles response

### 6. Automatic Trigger

- **Trigger function**: `trigger_auto_generate_roof_estimate()`
- Automatically detects when roof scope is parsed (Block 20380)
- Validates that estimate doesn't already exist
- Ready for integration with pg_net for automatic edge function calls

## 📋 Estimate Output Structure

The estimator generates a complete estimate JSON:

```json
{
  "roof_estimate": {
    "base_rate_per_sq": 425,
    "squares": 32.5,
    "steep_charge": 1462,
    "two_story_charge": 487,
    "ice_and_water": 165,
    "ridge_vent_rate": 10,
    "calculated_total": 18940,
    "profit_margin": 20,
    "final_bid_price": 22680,
    "line_items": [...]
  },
  "insurance_comparison": {
    "insurance_rcv": 28500,
    "contractor_estimate": 22680,
    "difference": 5820
  },
  "supplements": {
    "missing_items_supplements": [
      "Add steep charge",
      "Add drip edge",
      "Upgrade to ridge vent"
    ],
    "supplement_value_estimate": 2200
  }
}
```

## 🔄 Integration Points

### Block 20380 (Insurance Attachment Parser)
- Requires parsed `roof_scope` in `inbox_threads`
- Uses `claim_financials` and `profitability_signals`
- Trigger automatically fires when `has_parsed_scope` becomes true

### Block 20020 (Estimate Builder v2)
- Can be integrated with existing estimate system
- `roof_estimates` table is separate but can be linked to `estimates` table

### Contractor Preferences
- Uses `contractor_pricing` table for profit margins and markup
- Falls back to defaults if preferences not set

## 🚀 Usage

### Manual Generation (UI)
```tsx
import { GenerateRoofingEstimateButton } from "@/components/inbox/GenerateRoofingEstimateButton";

<GenerateRoofingEstimateButton
  threadId={threadId}
  onEstimateGenerated={(estimate) => {
    // Handle generated estimate
    console.log("Estimate:", estimate);
  }}
/>
```

### API Call
```typescript
const response = await fetch("/api/inbox/estimates/generate-roofing", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    threadId: "thread-id",
    triggerReason: "manual_generate"
  }),
});
```

### Edge Function Call
```typescript
const { data } = await supabase.functions.invoke("roofing-ai-estimator-v1", {
  body: {
    thread_id: "thread-id",
    workspace_id: "workspace-id",
    trigger_reason: "parsed_scope"
  },
});
```

## 📊 Supplement Detection

The estimator automatically detects missing items for supplements:

- **Steep charge** - If roof is steep but insurance estimate doesn't include it
- **Drip edge** - Code-required item often missing from insurance estimates
- **Ridge vent** - Code-required ventilation upgrade
- **Starter course** - Code-required shingle installation item
- **Ice & water shield** - Code-required in certain climates
- **High-wind shingles** - If material type suggests high-wind requirements
- **Code-required items** - From `profitability_signals.code_items_included`

## 🎯 Next Steps (Future Enhancements)

1. **Zip-Code Pricing**: Upgrade market pricing dataset to include zip-code specific rates
2. **PDF Generation**: Generate professional PDF estimate documents
3. **Better Roof Upgrades**: Add optional upgrade pricing suggestions
4. **Automatic Trigger**: Use pg_net to automatically call edge function when scope is parsed
5. **Estimate Comparison**: Compare multiple estimate versions
6. **Integration with Estimates Table**: Link `roof_estimates` with existing `estimates` table

## 📝 Notes

- MVP version uses national default pricing (can be upgraded to zip-code pricing)
- Estimate document is text-based (PDF generation can be added later)
- Automatic trigger is set up but relies on frontend/API for actual generation (can be enhanced with pg_net)
- Supplement detection compares against insurance line items and code requirements
















































