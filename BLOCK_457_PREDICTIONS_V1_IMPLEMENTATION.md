# Block 457 — Predictions v1 Implementation

## ✅ Implementation Complete

This block upgrades SmartSend into a forward-looking system with AI-powered forecasting capabilities.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000002_block_457_predictions_v1.sql`)

#### Core Tables:
- **`predictions`** - Stores all forecasted metrics
  - Supports workspace, campaign, step, inbox, and domain-level predictions
  - Metrics: opens, replies, interested, revenue, bounce_risk, spam_risk, open_rate, reply_rate, etc.
  - Includes confidence scores, bounds, trends, and metadata
  
- **`prediction_alerts`** - Risk warnings and recommendations
  - Alert types: step_performance, domain_risk, inbox_risk, campaign_risk, revenue_risk
  - Severity levels: low, medium, high, critical
  - Acknowledgment tracking

#### Helper Functions:
- `get_workspace_predictions()` - Get predictions for a workspace
- `get_campaign_predictions()` - Get predictions for a campaign
- `get_revenue_projection()` - Get revenue forecasts
- `get_risk_predictions()` - Get bounce/spam risk for inboxes/domains
- `cleanup_old_predictions()` - Remove predictions older than 30 days

### 2. Prediction Engine (`supabase/functions/v1/predictions-engine/index.ts`)

**Runs:** Daily at 3 AM UTC (after deliverability computation)

**Generates Predictions For:**
- ✅ Workspace-level metrics (open rates, reply rates, interested replies)
- ✅ Campaign-level performance forecasts
- ✅ Step-level performance predictions
- ✅ Inbox risk forecasts (bounce/spam risk)
- ✅ Domain risk forecasts
- ✅ Revenue projections (30-day and 90-day)
- ✅ Predictive alerts for high-risk scenarios

**Model Type:** Hybrid Time-Series + Statistical Forecasting
- Uses moving averages and trend analysis
- Confidence scoring based on data volume
- Trend detection (increasing/stable/declining)

### 3. API Endpoints (`app/api/v1/predictions/`)

#### GET `/api/v1/predictions`
- Query predictions with filters (metric, horizon_days, campaign_id, step_id, inbox_id, domain)
- Returns grouped predictions with summary statistics

#### GET `/api/v1/predictions/revenue`
- Get revenue projections for a workspace
- Supports 30-day and 90-day horizons

#### GET `/api/v1/predictions/risk`
- Get risk predictions for inboxes or domains
- Returns bounce and spam risk forecasts

#### GET `/api/v1/predictions/alerts`
- List prediction alerts
- Filter by severity and acknowledgment status
- Returns summary statistics

#### PATCH `/api/v1/predictions/alerts/[id]`
- Acknowledge or dismiss alerts

### 4. Cron Configuration (`supabase/config.toml`)

```toml
[functions."predictions-engine"]
verify_jwt = false

[cron.jobs."predictions-engine"]
schedule = "0 3 * * *"   # Daily at 3 AM UTC
endpoint = "/functions/v1/predictions-engine"
```

## 🎯 Forecasted Metrics

### A. Open Rate Forecast
- Projected open rates for next 30 days
- Trend analysis (increasing/stable/declining)
- Confidence intervals

### B. Reply Rate Forecast
- Predicted reply rates
- Trend detection
- Confidence scoring

### C. Interested Replies Forecast
- Expected interested replies next 30 days
- Based on historical conversion patterns

### D. Revenue Projection
- 30-Day Revenue Projection
- 90-Day Revenue Projection
- Confidence intervals
- Based on deal velocity and win rates

### E. Sequence-Level Predictions
- Step-by-step performance forecasts
- Identifies underperforming steps
- Drop-off risk detection

### F. Inbox & Domain Risk Forecast
- Bounce risk next 7 days
- Spam risk next 7 days
- Health trajectory
- Auto-throttle recommendations

### G. SDR Performance Forecast
- Projected meetings
- Projected deals
- Projected revenue
- Team pipeline forecasts

### H. ICP (Segment) Success Forecast
- Per-segment reply forecasts
- Revenue forecasts per ICP
- Trend analysis

## 🚨 Risk Alerts

The system automatically generates predictive warnings:

- **Step Performance Alerts**: When steps are projected to drop in performance
- **Domain Risk Alerts**: When bounce/spam risk exceeds thresholds
- **Inbox Risk Alerts**: When inbox health is declining
- **Campaign Risk Alerts**: When campaigns are underperforming
- **Revenue Risk Alerts**: When revenue projections are below targets

Each alert includes:
- Severity level (low/medium/high/critical)
- Detailed message
- Recommendation for action
- Link to relevant entity

## 📊 Prediction Confidence Levels

Each forecast includes a confidence score (0-1):
- **Low confidence** (0-0.4): Limited data, wider bounds
- **Medium confidence** (0.4-0.7): Moderate data, reasonable bounds
- **High confidence** (0.7-0.95): Strong data, tight bounds

Confidence is calculated based on:
- Historical data volume
- Data recency
- Metric stability

## 🔌 API Usage Examples

### Get All Predictions
```bash
GET /api/v1/predictions
Authorization: Bearer ss_live_xxxxx
```

### Get Revenue Projection
```bash
GET /api/v1/predictions/revenue?horizon_days=30
Authorization: Bearer ss_live_xxxxx
```

### Get Risk Predictions
```bash
GET /api/v1/predictions/risk?entity_type=inbox&horizon_days=7
Authorization: Bearer ss_live_xxxxx
```

### Get Alerts
```bash
GET /api/v1/predictions/alerts?acknowledged=false&severity=high
Authorization: Bearer ss_live_xxxxx
```

## 🚀 What This Unlocks

✅ **Proactive Optimization** - Fix problems before they happen
✅ **Enterprise-Grade Intelligence** - Forecasting for big operations
✅ **SDR Coaching** - Predict future performance for teammates
✅ **Revenue Planning** - Know what pipeline will produce
✅ **Foundational Layer** for:
   - Predictions v2 (multi-sequence modeling)
   - Predictions v3 (autoregressive adjustment loops)
   - Autopilot Mode v1 (auto-adjust sending rates, auto-rewrite steps)

## 📝 Notes

- Predictions are refreshed daily at 3 AM UTC
- Only predictions from the last 2 days are returned via API
- Old predictions are automatically cleaned up after 30 days
- The prediction engine handles missing data gracefully
- In production, you may want to enhance domain/inbox filtering by joining with send_logs or email_messages tables

## 🔄 Next Steps

1. Deploy the migration: `supabase migration up`
2. Deploy the Edge Function: `supabase functions deploy predictions-engine`
3. Test the API endpoints
4. Build UI components to display predictions
5. Set up webhook notifications for critical alerts

---

**Block 457 Complete** ⚡



