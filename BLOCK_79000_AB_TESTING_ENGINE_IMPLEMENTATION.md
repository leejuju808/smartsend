# Block 79000 — A/B Testing Engine + Conversion Optimizer v1

## Implementation Complete ✅

This document summarizes the complete implementation of the A/B Testing Engine for SmartSend Roofing.

## What Was Built

### 1. Database Schema ✅
**File:** `supabase/migrations/20250131000000_ab_testing_engine_v1.sql`

- **ab_variants** — Stores test variants (A, B, C, etc.) with subject, body, persona
- **ab_metrics** — Real-time performance tracking (sends, opens, replies, booked estimates, closed jobs)
- **ab_winners** — Winning variant assignments with reasons
- **ab_variant_assignments** — Tracks which lead got which variant
- **ab_zip_performance** — ZIP code performance layer for geographic insights

**Key Functions:**
- `assign_ab_variant()` — Automatically splits audience (20% each variant, 40% winner)
- `increment_ab_metric()` — Updates metrics with ZIP code tracking
- `select_ab_winner()` — Auto-selects winner based on performance
- `initialize_ab_metrics()` — Sets up metrics for new variants

**Views:**
- `v_ab_variant_performance` — Real-time variant performance dashboard
- `v_ab_zip_performance` — ZIP code performance insights

### 2. A/B Test Dashboard UI ✅
**File:** `components/campaigns/ABTestDashboard.tsx`

Features:
- Real-time variant performance table
- Shows sends, opens, replies, booked estimates, closed jobs
- Conversion rate calculations
- Winner highlighting with trophy icon
- Create/Edit/Kill variant actions
- Auto-refresh every 30 seconds
- Winner card with reason display

### 3. Variant Editor ✅
**File:** `components/campaigns/ABVariantEditor.tsx`

Features:
- Create new variants (auto-generates label A, B, C...)
- Edit existing variants
- Subject line and body editing
- Persona selection support
- Template variable support ({{first_name}}, etc.)

### 4. API Routes ✅

**Variant Management:**
- `GET/POST /api/campaigns/[id]/ab-test/variants` — List/create variants
- `GET/PUT/DELETE /api/campaigns/[id]/ab-test/variants/[variantId]` — Manage variant

**Winner Management:**
- `GET /api/campaigns/[id]/ab-test/winner` — Get current winner
- `POST /api/campaigns/[id]/ab-test/select-winner` — Manually select winner
- `POST /api/campaigns/[id]/ab-test/auto-select-winner` — Auto-select winner

**Event Tracking:**
- `POST /api/campaigns/[id]/ab-test/track-event` — Track opens, replies, booked estimates, closed jobs

### 5. Integration with Campaign Engine ✅

**Queue Creation:**
- `src/app/api/campaigns/create-and-queue/route.ts` — Assigns variants when creating send queue
- Automatically checks for A/B variants
- Uses `assign_ab_variant()` function for smart splitting
- Renders variant-specific subject/body templates

**Queue Worker:**
- `app/api/queue/worker/route.ts` — Tracks sends when emails are sent
- Updates `ab_metrics` when email status changes to "sent"

### 6. Metrics Tracking ✅
**File:** `lib/ab-testing/metrics.ts`

Helper functions:
- `trackABSend()` — Track email send
- `trackABOpen()` — Track email open
- `trackABReply()` — Track reply received
- `trackABBookedEstimate()` — Track estimate booked
- `trackABClosedJob()` — Track job closed
- `getVariantForLead()` — Get assigned variant
- `assignVariantToLead()` — Assign variant to lead

### 7. Auto-Winner Selection Cron ✅
**File:** `app/api/cron/ab-test-winner-selector/route.ts`

- Runs periodically to auto-select winners
- Checks campaigns with A/B testing enabled
- Requires minimum 10 sends per variant
- Selects winner based on: closed jobs > booked estimates > replies > opens

### 8. ZIP Code Performance Tracking ✅

- Tracks performance by ZIP code automatically
- Stored in `ab_zip_performance` table
- Updated via `increment_ab_metric()` function
- Viewable via `v_ab_zip_performance` view

## How It Works

### 1. Creating Variants
1. User clicks "Create Variant" in A/B Test Dashboard
2. Enters subject, body, variant label (A, B, C...)
3. Variant is created and metrics initialized

### 2. Audience Splitting
When leads are queued:
1. System checks if campaign has A/B variants
2. For each lead, calls `assign_ab_variant()`:
   - If no winner: Even split (20% each for first 3, remaining 40% split)
   - If winner exists: 60% winner, 40% testing variants
3. Variant assignment stored in `ab_variant_assignments`
4. Variant-specific subject/body rendered and queued

### 3. Performance Tracking
- **Sends:** Tracked when email status = "sent"
- **Opens:** Tracked via webhook/event handler → `track-event` API
- **Replies:** Tracked via inbox processor → `track-event` API
- **Booked Estimates:** Tracked when estimate is booked → `track-event` API
- **Closed Jobs:** Tracked when job is closed → `track-event` API

### 4. Winner Selection
**Automatic:**
- Cron job runs periodically
- Checks campaigns with sufficient data (10+ sends per variant)
- Selects winner based on performance priority
- Updates `ab_winners` table

**Manual:**
- User clicks "Select Winner" button
- Immediately sets winner for campaign

### 5. Winner Deployment
Once winner is selected:
- Future sends use winner 60% of the time
- Remaining 40% continues testing other variants
- Dashboard shows winner with trophy icon
- Winner card displays reason

## Integration Points

### Campaign Page
The A/B Test Dashboard is integrated into:
- `app/(dashboard)/campaigns/[id]/page.tsx`

Shows above Performance Panel and Follow-Up Stats.

### Event Tracking Integration
To track events, call:
```typescript
POST /api/campaigns/[campaignId]/ab-test/track-event
{
  "event_type": "open" | "reply" | "booked_estimate" | "closed_job",
  "lead_id": "uuid",
  "variant_id": "uuid" (optional, will lookup if not provided),
  "zip_code": "12345" (optional)
}
```

### Webhook Integration
When emails are opened/replied, call the track-event API to update metrics.

## Database Functions

### `assign_ab_variant(campaign_id, lead_id, zip_code)`
Returns variant UUID assigned to lead. Handles:
- Even splitting when no winner
- Winner deployment (60/40 split)
- ZIP code tracking

### `increment_ab_metric(variant_id, metric_type, increment, zip_code, campaign_id)`
Updates metrics for variant. Supports:
- Main metrics table
- ZIP code performance table (if zip_code provided)

### `select_ab_winner(campaign_id)`
Automatically selects winner based on performance. Returns winner UUID.

## UI Components

### ABTestDashboard
- Main dashboard component
- Shows all variants with performance metrics
- Winner highlighting
- Create/Edit/Kill actions

### ABVariantEditor
- Modal for creating/editing variants
- Subject and body editing
- Auto-generates variant labels

## Next Steps (Future Enhancements)

1. **Statistical Significance Testing** — Add p-value calculations
2. **Multi-Variate Testing** — Test multiple elements simultaneously
3. **Time-Based Splitting** — Test variants at different times of day
4. **Persona-Based Testing** — Test variants by lead persona
5. **Storm-Based Testing** — Boost variants after storms
6. **Export Performance Data** — CSV export for analysis

## Testing Checklist

- [ ] Create campaign with A/B variants
- [ ] Queue leads and verify variant assignment
- [ ] Send emails and verify send tracking
- [ ] Track opens and verify metric updates
- [ ] Track replies and verify metric updates
- [ ] Book estimates and verify tracking
- [ ] Close jobs and verify tracking
- [ ] Auto-select winner after sufficient data
- [ ] Verify winner deployment (60/40 split)
- [ ] Test ZIP code performance tracking
- [ ] Test manual winner selection
- [ ] Test variant editing
- [ ] Test variant deletion

## Notes

- Minimum 10 sends per variant required for auto-winner selection
- Winner selection prioritizes: closed jobs > booked estimates > replies > opens
- ZIP code tracking is optional but recommended for geographic insights
- All metrics update in real-time via database functions
- Dashboard auto-refreshes every 30 seconds

---

**Implementation Date:** January 31, 2025
**Block:** 79000
**Status:** ✅ Complete



























