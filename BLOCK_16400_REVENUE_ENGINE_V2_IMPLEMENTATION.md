# Block 16400 — SmartSend Revenue Engine v2 Implementation

## Overview
Transform SmartSend from a communication tool → into a true revenue intelligence system that shows roofers:
- How much money is in their pipeline
- Which jobs are most likely to close
- Where opportunities are
- Which storm jobs are high-value
- Potential insurance payouts
- Estimated close dates
- Total revenue forecast

## Implementation Summary

### ✅ Database Migration
**File:** `supabase/migrations/20250130000002_block16400_revenue_engine_v2.sql`

**New Tables:**
1. `revenue_stats` - Aggregated revenue statistics per workspace
2. `job_estimates` - Detailed job estimates with calculation factors
3. `close_probability` - Close probability scores (0-100) for contacts
4. `storm_revenue_scores` - Storm revenue tracking and recommendations

**Enhanced Tables:**
- `contacts` - Added fields: close_probability, estimated_close_date, quote_amount, insurance_claim_value_min/max, storm_impact_severity, high_value_flag, home_value, roof_size_sqft, roof_age_years
- `revenue_events` - Added fields: event_type, old/new_close_probability, quote_amount, estimated_close_date

**New Functions:**
1. `detect_job_type_v2()` - Enhanced job type detection with 7 categories
2. `calculate_estimated_value_v2()` - Enhanced value calculation with home value, roof size, roof age factors
3. `calculate_close_probability()` - Calculates 0-100 close probability score
4. `calculate_insurance_revenue()` - Calculates insurance claim revenue (ACV vs RCV, deductible, payout)
5. `calculate_revenue_forecast()` - 7/30/90 day revenue forecasts
6. `calculate_storm_revenue()` - Storm revenue booster with recommendations
7. `sync_quote_data()` - Syncs quote data when quote is sent
8. `calculate_contact_revenue_v2()` - Main revenue calculation function v2
9. `calculate_workspace_revenue_stats()` - Aggregated workspace stats

### ✅ API Routes
**File:** `app/api/revenue/dashboard/route.ts` (Updated)
- Enhanced to use v2 functions
- Returns: Pipeline values, job type breakdown, close probabilities, forecasts, storm revenue

**File:** `app/api/revenue/contact/[id]/route.ts` (New)
- Returns detailed revenue data for a specific contact
- Includes: Estimated job value, job type, close probability, insurance claim data, revenue timeline

### ✅ Edge Functions
**File:** `supabase/functions/revenue-updateScore/index.ts`
- Updates close probability score for a contact

**File:** `supabase/functions/revenue-syncQuote/index.ts`
- Syncs quote data when a quote is sent

**File:** `supabase/functions/revenue-forecast/index.ts`
- Calculates revenue forecast for a workspace

**File:** `supabase/functions/revenue-stormBoost/index.ts`
- Calculates storm revenue potential and recommendations

## Features Implemented

### 1. The 7 Revenue Categories
- ✅ Repair Revenue ($250–$1,500)
- ✅ Replacement Revenue ($7,000–$24,000+)
- ✅ Insurance Claim Revenue ($12,000–$35,000+)
- ✅ Commercial/Flat Roof Revenue
- ✅ Gutter Work Revenue ($300–$1,200)
- ✅ Skylight Revenue
- ✅ Misc / Unknown

### 2. Auto-Detection of Job Type (v2)
Detects based on:
- ✅ Storm risk
- ✅ Insurance keywords
- ✅ Roof age
- ✅ Home value
- ✅ Neighborhood
- ✅ Quote data
- ✅ Homeowner language (Reply Brain)
- ✅ Photo uploads (via tags/enrichment)
- ✅ List type

### 3. Estimated Job Value (v2 Algorithm)
Uses:
- ✅ Home value
- ✅ Roof size (inferred from enrichment)
- ✅ Roof age
- ✅ Job type
- ✅ Insurance claim status
- ✅ Storm severity
- ✅ Neighborhood price ranges
- ✅ Past quotes
- ✅ Historical close rate

### 4. Close Probability Score (0–100)
Based on:
- ✅ Reply interest
- ✅ Storm urgency
- ✅ Insurance claim activity
- ✅ Homeowner tone
- ✅ Past interactions
- ✅ Booking behavior
- ✅ Quote sent or not
- ✅ Lead heat score

**Scoring:**
- 80+ → Highly likely
- 50–79 → Possible
- < 50 → Unlikely

### 5. Revenue Dashboard (Elite v2)
**Path:** `/revenue`

Shows:
- ✅ Total pipeline value
- ✅ Value by job type (7 categories)
- ✅ Value by stage
- ✅ Insurance opportunity totals
- ✅ Closing probability averages
- ✅ Revenue forecast (7/30/90 days)
- ✅ Quote conversion rate
- ✅ Storm job revenue
- ✅ Top neighborhoods by revenue
- ✅ Average job value
- ✅ Highest-value homeowner leads

### 6. Revenue Timeline Events
Logged when:
- ✅ Quote created
- ✅ Quote updated
- ✅ Re-quote triggered
- ✅ Job type revised
- ✅ Insurance activity detected
- ✅ Inspection completed
- ✅ Closing probability update
- ✅ High-value flag applied

### 7. Contact Revenue Panel (v2)
Each contact profile includes:
- ✅ Estimated job value
- ✅ Job type
- ✅ Close probability
- ✅ Storm impact severity
- ✅ Insurance likelihood
- ✅ Last quote amount
- ✅ Recommended next step
- ✅ Revenue timeline

### 8. Insurance Revenue Logic (v2)
When claim is detected:
- ✅ Calculates deductible
- ✅ ACV vs RCV
- ✅ Likely payout
- ✅ Neighborhood pricing
- ✅ Storm severity impact
- ✅ Typical insurance replacement cost in that ZIP

### 9. Forecasting Engine (Roofing-Specific)
Predicts:
- ✅ 7-Day Forecast (jobs likely to close this week)
- ✅ 30-Day Forecast (pipeline transformation)
- ✅ 90-Day Forecast (storm-season revenue mapping)

### 10. Storm Revenue Booster (v2)
Calculates:
- ✅ How many storm homes are in the pipeline
- ✅ How many are HOT
- ✅ How many have insurance interest
- ✅ Potential storm revenue
- ✅ Recommended campaigns
- ✅ Ideal follow-up order

### 11. Quote Sync (v2)
When a roofer sends a quote:
- ✅ Moves pipeline to "Quote Sent"
- ✅ Extracts amount
- ✅ Recalculates job value
- ✅ Recalculates close probability
- ✅ Adds follow-up tasks (via revenue events)
- ✅ Notifies roofer of stale quotes (can be added via cron)

## Database Schema

### revenue_stats
Aggregated stats per workspace including:
- Pipeline totals (hot/warm/cold)
- Value by job type (7 categories)
- Value by stage
- Insurance opportunities
- Close probability averages
- Revenue forecasts
- Conversion metrics
- Storm revenue

### close_probability
Per-contact close probability scores with breakdown:
- Total score (0-100)
- Individual component scores
- Flags (has_reply, has_insurance, etc.)
- Calculation factors

### storm_revenue_scores
Storm revenue tracking:
- Storm identification (date, type, affected zips)
- Revenue metrics
- Breakdown
- Recommendations

### job_estimates
Detailed job estimates:
- Job type and revenue category
- Value estimates (min/max/avg)
- Confidence score
- Calculation factors
- Version tracking

## API Endpoints

### GET /api/revenue/dashboard
Returns comprehensive revenue dashboard data including:
- Pipeline values
- Job type breakdown
- Close probabilities
- Forecasts
- Storm revenue

### GET /api/revenue/contact/[id]
Returns detailed revenue data for a specific contact

## Edge Functions

### POST /revenue/updateScore
Updates close probability score for a contact

### POST /revenue/syncQuote
Syncs quote data when a quote is sent

### GET/POST /revenue/forecast
Calculates revenue forecast for a workspace

### GET/POST /revenue/stormBoost
Calculates storm revenue potential

## Next Steps

1. **Frontend Updates:** Update the revenue dashboard page (`app/(dashboard)/revenue/page.tsx`) to use the new v2 API structure
2. **Contact Profile Integration:** Add revenue panel to contact detail pages
3. **Pipeline Board Integration:** Show close probability and estimated values in pipeline cards
4. **Task Board Integration:** Show revenue context in task cards
5. **Cron Jobs:** Set up scheduled jobs to:
   - Recalculate close probabilities daily
   - Update revenue forecasts
   - Check for stale quotes (48+ hours)
   - Calculate storm revenue weekly

## Testing Checklist

- [ ] Test job type detection with various signals
- [ ] Test close probability calculation
- [ ] Test insurance revenue calculation
- [ ] Test quote sync functionality
- [ ] Test revenue forecast calculation
- [ ] Test storm revenue booster
- [ ] Test API endpoints
- [ ] Test edge functions
- [ ] Verify RLS policies
- [ ] Test revenue events logging

## Notes

- All database functions use `SECURITY DEFINER` for service role access
- RLS policies are in place for all new tables
- The system is backward compatible with v1 revenue engine
- Close probability is automatically recalculated when relevant data changes
- Revenue stats are calculated on-demand and cached in `revenue_stats` table





















































