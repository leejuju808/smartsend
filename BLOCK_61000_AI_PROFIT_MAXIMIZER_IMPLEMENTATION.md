# Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1

## ✅ Implementation Complete

This block turns SmartSend into the financial brain of a roofing company, providing real-time profit analysis, AI pricing recommendations, underbid detection, upsell suggestions, and job profit health scores.

## 📦 What Was Built

### 1. Database Schema ✅
**File:** `supabase/migrations/20250201000000_block61000_ai_profit_maximizer_pricing_optimization_v1.sql`

Created four new tables:
- **`profit_analysis`** - Real-time profit calculation with estimated vs actual tracking
- **`pricing_recommendations`** - AI-generated pricing recommendations for proposals
- **`upsell_suggestions`** - AI-generated upsell opportunities
- **`underbid_detections`** - Track detected underbids and corrections

**Key Features:**
- Calculated fields for profit, variance, margin percentage
- Health score calculation (0-100)
- AI reasoning stored as JSONB
- Comprehensive indexes for performance
- Row-Level Security (RLS) policies
- Auto-updating health scores via triggers

### 2. Edge Functions ✅

#### `/profit/calc` - Profit Calculation
**File:** `supabase/functions/profit/calc/index.ts`
- Calculates estimated vs actual profit
- Computes variance and margin percentage
- Updates health score automatically
- Integrates with existing job_costs tables

#### `/profit/ai-pricing` - AI Pricing Recommendations
**File:** `supabase/functions/profit/ai-pricing/index.ts`
- Generates recommended, minimum, and high-value prices
- Uses OpenAI to provide reasoning
- Considers material costs, labor rates, historical performance
- Factors in season, complexity, and market conditions

#### `/profit/underbid-check` - Underbid Detection
**File:** `supabase/functions/profit/underbid-check/index.ts`
- Flags underpriced proposals before sending
- Calculates potential loss
- Identifies risk factors
- Provides suggested corrections

#### `/profit/upsells` - Upsell Generation
**File:** `supabase/functions/profit/upsells/index.ts`
- AI generates upsell opportunities
- Catalog of standard upsells (Class 4 shingles, ridge vents, etc.)
- Calculates revenue impact and profit
- Considers job context and homeowner budget

#### `/profit/forecast` - Profit Forecasting
**File:** `supabase/functions/profit/forecast/index.ts`
- Predicts future profits based on weather, crew, materials, season
- Provides best-case, worst-case, and expected scenarios
- Factors in crew efficiency, weather impact, seasonality
- Includes upsell impact projections

### 3. API Routes ✅

**Files:**
- `app/api/profit/calc/route.ts` - Profit calculation proxy
- `app/api/profit/ai-pricing/route.ts` - AI pricing proxy
- `app/api/profit/underbid-check/route.ts` - Underbid check proxy
- `app/api/profit/upsells/route.ts` - Upsell generation proxy
- `app/api/profit/forecast/route.ts` - Profit forecasting proxy
- `app/api/profit/dashboard/route.ts` - Dashboard data aggregation

All routes proxy to Supabase Edge Functions with proper error handling.

### 4. UI Components ✅

**Files:**
- `components/profit/ProfitDashboard.tsx` - Main dashboard container
- `components/profit/JobProfitCards.tsx` - Job profit cards with expandable details
- `components/profit/UnderbidAlerts.tsx` - Underbid alerts banner
- `components/profit/UpsellRevenueTracker.tsx` - Upsell revenue tracking
- `components/profit/ProfitHeatmap.tsx` - Crew performance heatmap

**Features:**
- Real-time data refresh (60s intervals)
- Color-coded health scores and margins
- Expandable job cards for detailed view
- Responsive grid layouts
- Beautiful dark theme with zinc color palette

### 5. Dashboard Page ✅

**File:** `app/(owner)/dashboard/profit/page.tsx`
- Full-page profit dashboard
- Integrated with owner dashboard
- Accessible via `/dashboard/profit`

## 🎯 Core Features

### A. Real-Time Profit Calculation
- ✅ Estimated vs actual profit tracking
- ✅ Variance calculation
- ✅ Margin percentage
- ✅ Health score (0-100)

### B. AI Pricing Recommendation Engine
- ✅ Recommended price
- ✅ Minimum profitable price
- ✅ High-value price (premium neighborhoods)
- ✅ AI reasoning with OpenAI

### C. Underbid Detection
- ✅ Flags underpriced proposals
- ✅ Shows potential loss
- ✅ Breakdown of missing costs
- ✅ Suggested corrections

### D. Upsell Opportunity Analyzer
- ✅ AI-generated upsell suggestions
- ✅ Revenue and profit impact
- ✅ Impact score (0-100)
- ✅ Category-based organization

### E. Job Profit Health Score
- ✅ 0-100 score based on margin, variance, profit
- ✅ Color-coded indicators
- ✅ Performance labels (Excellent, Solid, Needs Improvement, Red Flag)

### F. Profit Forecasting
- ✅ Expected profit projection
- ✅ Best-case / worst-case scenarios
- ✅ Weather, crew, season impact
- ✅ Upsell impact included

## 🚀 Usage

### Calculate Profit for a Job
```typescript
POST /api/profit/calc
{
  "job_id": "uuid"
}
```

### Get AI Pricing Recommendations
```typescript
POST /api/profit/ai-pricing
{
  "job_id": "uuid",
  "material_costs": {},
  "labor_rates": {},
  "square_footage": 2500,
  "roof_type": "asphalt",
  "complexity": "medium",
  "season": "summer",
  "neighborhood_value": "high"
}
```

### Check for Underbids
```typescript
POST /api/profit/underbid-check
{
  "job_id": "uuid",
  "proposed_price": 12000
}
```

### Generate Upsells
```typescript
POST /api/profit/upsells
{
  "job_id": "uuid",
  "roof_type": "asphalt",
  "neighborhood": "premium",
  "shingle_selection": "standard"
}
```

### Forecast Profit
```typescript
POST /api/profit/forecast
{
  "job_id": "uuid",
  "weather_forecast": "clear",
  "crew_name": "Crew A",
  "materials_available": true,
  "season": "summer"
}
```

## 📊 Database Functions

### `calculate_profit_health_score(margin, variance, profit)`
Calculates health score (0-100) based on:
- Margin percentage (0-50 points)
- Variance from estimate (0-30 points)
- Actual profit amount (0-20 points)

### `update_profit_health_score(job_id)`
Automatically updates health score when profit analysis changes.

## 🔒 Security

- Row-Level Security (RLS) enabled on all tables
- Team-scoped access control
- Service role for edge functions
- Authenticated users only

## 🎨 UI Features

- **Job Profit Cards**: Revenue, profit, margin, health score
- **Underbid Alerts**: Top banner with critical alerts
- **Upsell Tracker**: Total revenue, acceptance rate, most accepted
- **Profit Heatmap**: Crew performance visualization

## 📈 Business Impact

This module is designed to:
- ✅ Stop underbidding
- ✅ Increase margins
- ✅ Help contractors charge correctly
- ✅ Increase average job size
- ✅ Prevent losses
- ✅ Make jobs more profitable

**Value Proposition:** This module alone is worth $399/mo to a roofing company. A contractor who makes more money = NEVER cancels SmartSend.

## 🔄 Integration Points

- Integrates with existing `job_costs` table (Block 37444)
- Uses `jobs` table for job data
- Connects to `team_members` for access control
- Leverages OpenAI for AI recommendations

## 📝 Next Steps

1. Deploy database migration
2. Deploy edge functions
3. Test API routes
4. Verify UI components
5. Add to navigation menu
6. Monitor performance

## 🐛 Known Limitations

- Health score calculation is simplified (can be enhanced)
- AI pricing uses GPT-4o-mini (can upgrade to GPT-4)
- Upsell catalog is static (can be made dynamic)
- Forecast factors are basic (can add more sophisticated models)





























