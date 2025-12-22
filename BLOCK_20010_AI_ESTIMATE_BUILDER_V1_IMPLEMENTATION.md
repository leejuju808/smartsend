# Block 20010 — SmartSend Inbox AI Estimate Builder v1

## Implementation Summary

This block implements a comprehensive AI-powered estimate builder that generates instant roofing quotes directly inside the inbox thread view.

## ✅ Completed Features

### 1. Database Schema
- **estimate_templates**: Prebuilt templates for different roofing job types (repairs, replacements, insurance)
- **estimates**: Stores AI-generated estimates with pricing, materials, complexity factors
- **estimate_line_items**: Individual line items for each estimate with quantities and costs
- Pricing calculation functions with material detection, pitch multipliers, complexity adjustments

### 2. API Endpoints

#### POST `/api/inbox/estimates/generate`
- Generates AI-powered estimate for a thread
- Uses roof measurements, material detection, job classification
- Calculates pricing based on squares, materials, pitch, complexity, region
- Creates line items using AI reasoning

#### POST `/api/inbox/estimates/[estimateId]/send`
- Sends estimate range to homeowner via email/SMS
- Updates thread pipeline stage to "estimate_scheduled"
- Creates message in inbox_messages

#### POST `/api/inbox/estimates/[estimateId]/pdf`
- Generates professional PDF estimate document
- Returns HTML content (can be converted to PDF on client side)
- Includes line items, pricing, AI reasoning, terms

#### POST `/api/inbox/estimates/[estimateId]/approve`
- Approves estimate and moves thread to pipeline stage
- Updates thread estimated value
- Can move to "pending_decision" or "won" stage

#### GET `/api/inbox/estimates`
- Fetches estimate for a thread
- Returns estimate with line items

### 3. Frontend Components

#### `GenerateEstimateButton`
- Button component to trigger estimate generation
- Shows loading state during generation
- Calls generate API endpoint

#### `EstimateDisplay`
- Displays estimate with price range, line items, job details
- Shows AI reasoning
- Actions: Send Quick Estimate, Generate PDF, Approve
- Expandable/collapsible view

### 4. Pricing Calculation Engine

The pricing engine uses:
- **Material costs per square**: Asphalt ($280-$380), Metal ($1100), Tile ($1350), Flat Roof ($650)
- **Labor costs per square**: Varies by material and complexity
- **Pitch multipliers**: Low (0.95), Medium (1.0), High (1.15), Steep (1.35)
- **Complexity multipliers**: Low (1.0), Medium (1.1), High (1.25), Very High (1.4)
- **Region multipliers**: Based on zip code pricing data
- **Feature add-ons**: Chimney ($450), Skylights ($350)

### 5. Estimate Templates

Pre-seeded templates for:
- **Repairs**: Leak patch, shingle replacement, pipe boot, flashing, chimney, skylight, valley
- **Replacements**: Full tear-off, partial tear-off, layover, full replacement with warranty
- **Insurance**: Code items, deductible notes, supplement suggestions

## Database Functions

### `calculate_estimate_total()`
Main function that calculates estimate totals based on:
- Roof squares
- Material type and shingle type
- Pitch category
- Complexity rating
- Region multiplier
- Feature flags (chimney, skylights, cut-up roof)
- Job type (repair vs replacement)

### `get_material_cost_per_square()`
Returns material cost per square based on material type and shingle type.

### `get_labor_cost_per_square()`
Returns labor cost per square based on material type and complexity.

### `get_pitch_multiplier()`
Returns pitch multiplier based on pitch category.

### `get_complexity_multiplier()`
Returns complexity multiplier based on complexity rating and feature flags.

## Integration Guide

### Adding to Thread View

1. Import components:
```tsx
import { GenerateEstimateButton } from "@/components/inbox/GenerateEstimateButton";
import { EstimateDisplay } from "@/components/inbox/EstimateDisplay";
```

2. Add state:
```tsx
const [hasEstimate, setHasEstimate] = useState(false);
const [estimate, setEstimate] = useState(null);
```

3. Add to JSX:
```tsx
<div className="mt-4 space-y-4">
  {!hasEstimate && (
    <GenerateEstimateButton
      threadId={threadId}
      onEstimateGenerated={(estimate) => {
        setHasEstimate(true);
        setEstimate(estimate);
      }}
    />
  )}
  
  {hasEstimate && (
    <EstimateDisplay
      threadId={threadId}
      estimate={estimate}
      onEstimateUpdated={() => {
        // Refresh data
      }}
    />
  )}
</div>
```

## Usage Flow

1. **Generate Estimate**: Owner clicks "Generate AI Estimate" button
   - System analyzes thread data (job type, severity, measurements, materials)
   - AI generates line items and reasoning
   - Pricing calculated using database functions
   - Estimate saved with status "draft"

2. **Review Estimate**: Owner reviews price range, line items, AI reasoning
   - Can expand/collapse to see details
   - Can see job type, roof size, material, complexity

3. **Send Quick Estimate**: Owner clicks "Send Quick Estimate"
   - Sends email/SMS with price range
   - Updates thread pipeline stage to "estimate_scheduled"
   - Estimate status changes to "sent"

4. **Generate PDF**: Owner clicks "Generate PDF"
   - Creates professional PDF document
   - Includes all line items, pricing, terms
   - Opens in new window

5. **Approve Estimate**: Owner clicks "Approve"
   - Moves thread to "pending_decision" or "won" stage
   - Updates thread estimated value
   - Estimate status changes to "approved"

## Pipeline Automation

When estimate is approved:
- Thread pipeline stage updates automatically
- Estimated value syncs to thread
- Revenue dashboard updates (via existing revenue view)
- Thread moves through pipeline stages based on actions

## Material Detection Integration

The estimate builder integrates with:
- `roof_measurements` table for roof size, pitch, complexity
- `material_intelligence` table for material type, shingle type
- `inbox_threads` table for job type, severity, insurance likelihood

## Pricing Accuracy

The system provides:
- **Repair estimates**: $350 - $520 range (typical)
- **Replacement estimates**: $14,200 - $18,600 range (for 22 squares)
- Adjustments for:
  - Steep pitch (+35%)
  - High complexity (+25-40%)
  - Metal/tile materials (higher labor)
  - Region pricing variations

## Next Steps (Future Enhancements)

1. **PDF Generation**: Integrate actual PDF library (Puppeteer, @react-pdf/renderer, pdfkit)
2. **SMS Integration**: Complete SMS sending integration
3. **Template Customization**: Allow roofers to customize templates
4. **Multi-currency**: Support different currencies
5. **Warranty Options**: Add warranty upgrade options
6. **Insurance Integration**: Deep integration with insurance claim data
7. **Photo Attachments**: Include photos in PDF estimates
8. **Digital Signatures**: Add signature capture for estimates
9. **Estimate History**: Track estimate revisions and versions
10. **Comparison View**: Compare multiple estimates side-by-side

## Files Created

### Database
- `supabase/migrations/20250130000002_block20010_ai_estimate_builder_v1.sql`

### API Routes
- `app/api/inbox/estimates/generate/route.ts`
- `app/api/inbox/estimates/[estimateId]/send/route.ts`
- `app/api/inbox/estimates/[estimateId]/pdf/route.ts`
- `app/api/inbox/estimates/[estimateId]/approve/route.ts`
- `app/api/inbox/estimates/route.ts`

### Components
- `components/inbox/GenerateEstimateButton.tsx`
- `components/inbox/EstimateDisplay.tsx`
- `components/inbox/EstimateIntegrationExample.tsx` (documentation)

## Testing Checklist

- [ ] Generate estimate for repair job
- [ ] Generate estimate for replacement job
- [ ] Verify pricing calculations match expected ranges
- [ ] Test material detection integration
- [ ] Test complexity multipliers
- [ ] Test pitch multipliers
- [ ] Send estimate via email
- [ ] Generate PDF estimate
- [ ] Approve estimate and verify pipeline update
- [ ] Test with different job types
- [ ] Test with different materials (asphalt, metal, tile)
- [ ] Test with different complexity levels
- [ ] Verify line items are generated correctly
- [ ] Test estimate display component
- [ ] Test estimate generation button

## Notes

- PDF generation currently returns HTML (can be converted to PDF client-side or server-side)
- SMS integration is placeholder (needs actual SMS provider integration)
- Estimate templates are pre-seeded but can be customized per workspace
- Pricing calculations use industry-standard ranges but can be adjusted per workspace
- AI reasoning uses GPT-4o-mini for cost efficiency
- All estimates are stored with full audit trail (created_at, updated_at, status changes)



















































