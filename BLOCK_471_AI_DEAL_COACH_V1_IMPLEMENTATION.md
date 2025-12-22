# Block 471 — AI Deal Coach v1 Implementation

## ✅ Implementation Complete

Block 471 adds the intelligence layer on top of Deals — the AI that analyzes deals, predicts outcomes, and tells SDRs exactly what to do next.

## 📦 What Was Built

### 1. Database Schema (`supabase/migrations/20250130000001_block471_ai_deal_coach_v1.sql`)

#### Core Tables:

**`deal_coach_insights`**
- Stores AI-generated insights for each deal
- Fields:
  - `win_probability` (0-100)
  - `confidence_score` (0-1)
  - `summary` (AI-generated deal summary)
  - `risk_tags` (array of risk indicators)
  - `risk_factors` (detailed risk data)
  - `recommended_next_action` (suggested action)
  - `recommended_action_type` (email, call, SMS, etc.)
  - `recommended_timing` (when to take action)
  - `detected_objections` (array of objections)
  - `objection_responses` (AI-generated responses)
  - `sdr_priority` (low, medium, high, urgent)
  - `suggested_message_template` (ready-to-use message)
  - `suggested_message_subject` (email subject)
  - `analysis_factors` (breakdown of probability calculation)

**`deal_coach_reports`**
- Daily pipeline-wide AI reports
- Fields:
  - `priority_deals` (top deals needing attention)
  - `stalled_deals` (deals stuck in stage)
  - `risks` (pipeline-wide risks)
  - `opportunities` (growth opportunities)
  - `total_deals`, `high_priority_deals`, `stalled_deals_count`
  - `avg_win_probability`

**`deal_coach_activity`**
- Activity log of AI Coach actions
- Tracks: analyzes, probability updates, suggestions, objection responses

#### Helper Functions:

**`calculate_deal_win_probability(deal_id)`**
- Calculates win probability based on:
  - Stage weight (baseline probability)
  - Reply engagement (+10% if replied in 7 days, -18% if no reply in 10+ days)
  - ICP match score (+8% for high ICP, -5% for low ICP)
  - Deal velocity (penalty for slow-moving deals)
  - Meeting quality (sentiment analysis of meeting notes)
  - Competitor mentions (-9% penalty)
  - Research Agent signals (placeholder for future enhancement)
- Returns: `{win_probability, confidence, factors}`

**`detect_deal_risk_factors(deal_id)`**
- Detects risks:
  - No reply in X days
  - Deal stuck in stage
  - Competitor references
  - Negative sentiment
- Returns: `{risks: [], risk_tags: []}`

#### Triggers:

**`trg_ai_deal_coach_on_deal_update`**
- Automatically triggers AI analysis when deal is updated
- Fires on: stage change, probability change, status change, value change
- Calls edge function via `pg_net` HTTP request

**`trg_ai_deal_coach_on_deal_insert`**
- Automatically triggers AI analysis when new deal is created
- Ensures all new deals get analyzed immediately

### 2. Edge Function (`supabase/functions/v1/ai-deal-coach/index.ts`)

**Purpose:** Core AI Deal Coach engine that analyzes deals and generates insights

**Endpoints:**
- `POST /functions/v1/ai-deal-coach` with `{deal_id, trigger}` - Analyze single deal
- `POST /functions/v1/ai-deal-coach` with `{workspace_id, trigger: "daily_report"}` - Generate daily report

**Features:**

**Win Probability Engine:**
- Uses database function `calculate_deal_win_probability()`
- Factors: stage, reply engagement, ICP match, velocity, meeting quality, competitor mentions
- Returns probability (0-100) with confidence score

**Deal Summary Generation:**
- Uses OpenAI GPT-4o-mini to generate 2-3 sentence summaries
- Analyzes: communications, meeting notes, deal stage, lead info
- Fallback to rule-based summary if OpenAI unavailable

**Next Step Engine:**
- Suggests best next action based on:
  - Deal stage
  - Days since last communication
  - Risk factors
  - Win probability
- Action types: email, call, SMS, LinkedIn, schedule demo, etc.
- Includes timing recommendations

**Objection Handling:**
- Detects objections from communications and notes:
  - Price, timing, budget, competitor, not priority, existing solution
- Generates AI responses using OpenAI
- Returns ready-to-use objection responses

**Risk Factor Detection:**
- Uses database function `detect_deal_risk_factors()`
- Flags: no reply, stuck deals, competitor mentions, negative sentiment
- Returns risk tags and detailed risk data

**Priority Calculation:**
- Determines SDR priority (low/medium/high/urgent)
- Based on: win probability, risk factors, deal stage

**Message Template Generation:**
- Generates ready-to-use email templates
- Includes subject line and body
- Personalized with lead name and company

**Daily Report Generation:**
- Analyzes all open deals in workspace
- Identifies:
  - Priority deals (high win probability, action needed)
  - Stalled deals (no activity for 7+ days)
  - Pipeline-wide risks
  - Opportunities
- Calculates average win probability
- Saves to `deal_coach_reports` table

### 3. API Endpoints

**`GET /api/deals/[id]/coach`**
- Get AI insights for a specific deal
- Returns: insights, activity log
- Auto-triggers analysis if insights don't exist

**`POST /api/deals/[id]/coach`**
- Trigger manual analysis of a deal
- Returns: fresh insights

**`GET /api/deals/coach/reports`**
- Get daily AI reports for workspace
- Query params: `date` (optional), `brand_id` (optional)
- Returns: reports array, today's report

**`POST /api/deals/coach/reports`**
- Trigger manual generation of daily report
- Body: `{brand_id?}` (optional)

### 4. Cron Configuration

**Daily Report Generation:**
- Scheduled: Daily at 6 AM UTC
- Config: `supabase/config.toml`
- Calls: `/functions/v1/ai-deal-coach` with `trigger: "daily_report"`

### 5. Integration Points

**✅ Integrated With:**
- **Deals System** - Auto-analyzes on deal create/update
- **ICP Scoring** - Uses `lead.icp_score` in probability calculation
- **Predictions v1** - Can use prediction data for enhanced analysis (future)
- **Multi-Brand Manager** - Supports brand-specific reports
- **Campaign Logs** - Analyzes email/SMS communication history
- **Meeting Notes** - Analyzes meeting notes for sentiment
- **Deal Activity** - Tracks deal timeline and activity

**🔮 Future Integration Opportunities:**
- **AI Research Agent** - Use research_cache for enhanced signals
- **Router v2** - Use routing intelligence for better recommendations
- **Voice Steps** - Analyze call logs and outcomes
- **Outbound Engine** - Auto-trigger follow-up actions

## 🎯 Key Features Delivered

### ✅ Win Probability Engine
- Calculates probability based on 7+ factors
- Confidence scoring based on data availability
- Factor breakdown for transparency

### ✅ Deal Summary (AI-Generated)
- One-click display of deal status
- Highlights: interest level, key signals, current status
- Uses OpenAI for natural language generation

### ✅ Next Step Engine
- Suggests best action based on context
- Includes timing recommendations
- Action types: email, call, SMS, LinkedIn, demo, etc.

### ✅ Objection Handling
- Detects 6+ objection types
- Generates AI responses
- Ready-to-use objection handling

### ✅ Risk Factor Detection
- Flags 4+ risk types
- Visual risk tags
- Detailed risk descriptions

### ✅ Pipeline-Wide AI Report
- Daily morning reports
- Priority deals list
- Stalled deals identification
- Risk and opportunity summaries

### ✅ Deal Page AI Panel
- Win probability display
- Risk factors
- Summary
- Suggested next step
- SDR priority
- Message template (1-click insert)
- Timing recommendation

### ✅ Activity Log
- Tracks all AI Coach actions
- Shows probability updates
- Logs suggestions and responses

## 📊 Usage Examples

### Analyze a Deal
```bash
POST /api/deals/{deal_id}/coach
```

### Get Deal Insights
```bash
GET /api/deals/{deal_id}/coach
```

Response:
```json
{
  "insights": {
    "win_probability": 63,
    "confidence_score": 0.78,
    "summary": "Lead showed strong interest during the call...",
    "risk_tags": ["No reply (6 days)", "Competitor reference"],
    "recommended_next_action": "Send a short 'checking in' email...",
    "recommended_action_type": "send_followup_email",
    "recommended_timing": "2025-01-31T14:00:00Z",
    "sdr_priority": "high",
    "suggested_message_template": "Hi John,\n\nJust wanted to follow up...",
    "detected_objections": ["price"],
    "objection_responses": {
      "price": "I understand your concern about pricing..."
    }
  },
  "activities": [...]
}
```

### Get Daily Report
```bash
GET /api/deals/coach/reports
```

Response:
```json
{
  "reports": [...],
  "today_report": {
    "priority_deals": [
      {
        "deal_id": "...",
        "deal_name": "...",
        "win_probability": 67,
        "action_needed": "Follow up needed today"
      }
    ],
    "stalled_deals": [
      {
        "deal_id": "...",
        "stage": "Proposal Sent",
        "days_since_activity": 9
      }
    ],
    "risks": ["No reply (6 days)", "Competitor reference"],
    "total_deals": 45,
    "high_priority_deals": 3,
    "stalled_deals_count": 2,
    "avg_win_probability": 52
  }
}
```

## 🚀 Deployment Steps

1. **Run Migration:**
   ```bash
   supabase migration up
   ```

2. **Deploy Edge Function:**
   ```bash
   supabase functions deploy ai-deal-coach
   ```

3. **Set Environment Variables:**
   - `OPENAI_API_KEY` (optional, for AI summaries and objection responses)

4. **Verify Cron Job:**
   - Check `supabase/config.toml` has cron configuration
   - Or manually schedule via Supabase Dashboard

5. **Test:**
   - Create a test deal
   - Verify insights are generated automatically
   - Check daily report generation

## 📝 Notes

- **OpenAI Integration:** Optional but recommended for best results
- **Performance:** Analysis runs asynchronously via triggers
- **Scalability:** Designed to handle high deal volumes
- **Privacy:** All analysis happens server-side, no client-side AI calls

## 🔮 Future Enhancements

- **AI Negotiator** - Auto-generate negotiation strategies
- **Auto-Proposal Generator** - Generate proposals based on deal context
- **AI Pricing Strategy** - Suggest optimal pricing
- **Multi-thread Account Penetration** - Coordinate multiple deals per account
- **Team Sales Leaderboards** - Compare SDR performance
- **Auto Risk-Assessment Emails** - Send alerts for high-risk deals
- **Meeting Transcript Analysis** - AI notes from call transcripts
- **Win/Loss Attribution Engine** - Learn from closed deals

## ✅ Block 471 Complete

Block 471 — AI Deal Coach v1 shipped. ⚡



