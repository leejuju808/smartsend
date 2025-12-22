# Block 256300 — SmartSend AI Sales Coaching Engine v1 Implementation

## Overview

This implementation creates a comprehensive Sales Coaching Engine that transforms SmartSend into an automated, unbiased sales manager available 24/7. The system analyzes every sales call, scores performance, enforces scripts, detects deal risks, and optimizes follow-ups.

## What Was Built

### 1. Database Schema

#### **sales_calls** Table
Records every sales call with:
- **AI Transcription**: Full transcript with speaker labels and timestamps
- **Call Scoring (0-100)**: Overall score with breakdown across 9 categories:
  - Rapport building
  - Needs discovery
  - Emotional drivers
  - Value explanation
  - Financing mention
  - Closing statements
  - Objection handling
  - Proposal clarity
  - Professionalism

- **Script Enforcement**: Tracks adherence and detects deviations from:
  - Intro script
  - Inspection walkthrough
  - Proposal explanation
  - Financing script
  - Closing script
  - Upsell script

- **Deal Risk Detection**: Identifies dangerous signals:
  - "I need to think about it"
  - "Send it over email"
  - "We're collecting multiple quotes"
  - "Your price seems high"
  - "Call me next week"

- **Buying Signals**: Detects positive indicators (timeline questions, urgency, etc.)
- **Missed Upsells**: Flags forgotten opportunities (ridge vents, synthetic felt, warranties, gutters)
- **Call Outcomes**: Tracks results (scheduled inspection, quote requested, closed won/lost, etc.)

#### **sales_coaching_notes** Table
Structured coaching feedback tied to calls:
- Categorized notes (rapport, discovery, closing, etc.)
- Priority levels (low, medium, high, critical)
- Action items with due dates
- Training recommendations
- Tracks completion status

#### **sales_followup_tracker** Table
Automated follow-up coaching:
- Tracks follow-up attempts and frequency
- Calculates urgency based on lead age, risk flags, buying signals
- Recommends optimal follow-up timing
- Prevents deals from falling through cracks

### 2. Helper Functions

- **`update_followup_tracker_on_call()`**: Automatically updates follow-up tracker when calls are recorded
- **`calculate_followup_urgency()`**: Calculates urgency level based on multiple factors
- **`is_org_member()`**: RLS helper function for org-based access control

### 3. Performance Dashboards (Views)

#### **v_sales_rep_performance_coaching**
Complete rep performance metrics:
- Average call scores
- Script adherence rates
- Risk detection rates
- Close rates
- Follow-up performance
- Coaching notes summary
- Common strengths/weaknesses

#### **v_deal_risk_dashboard**
Identifies deals at risk:
- High/critical risk calls
- Risk flags detected
- Follow-up urgency
- Recommended actions

#### **v_followup_coaching_dashboard**
Follow-up optimization:
- Stale follow-ups (overdue)
- Recommended next steps
- Urgency levels
- Days since last contact

#### **v_script_adherence_dashboard**
Script compliance tracking:
- Adherence scores per call
- Deviation details
- Common deviation patterns

#### **v_upsell_opportunities_dashboard**
Revenue recovery:
- Missed upsells per call
- Potential revenue lost
- Customer interest indicators

### 4. Security & Access Control

- Row Level Security (RLS) enabled on all tables
- Org-based access control
- Compatible with multiple org membership table structures
- Service role access for system operations

## Key Features

### ✅ AI Transcription
- Every call is automatically transcribed
- Speaker labels and timestamps
- Searchable, scorable, coachable

### ✅ Call Scoring (0-100)
- Comprehensive scoring across 9 categories
- Identifies strengths and weaknesses
- Tracks improvement over time

### ✅ Script Enforcement
- Deviation detection
- Compliance scoring
- Training recommendations

### ✅ Deal Risk Detection
- Real-time risk flagging
- Severity levels
- Recommended actions

### ✅ Follow-Up Optimization
- Prevents lazy follow-ups
- Optimal timing recommendations
- Urgency calculations

### ✅ Rep Performance Analytics
- Individual and team metrics
- Comparative analysis
- Improvement tracking

### ✅ Upsell Detection
- Flags missed opportunities
- Calculates potential revenue loss
- Customer interest tracking

## Database Migration

File: `supabase/migrations/20250226000000_block256300_sales_coaching_engine_v1.sql`

### Tables Created:
1. `sales_calls` - Main call recording and analysis table
2. `sales_coaching_notes` - Structured coaching feedback
3. `sales_followup_tracker` - Follow-up frequency and timing

### Views Created:
1. `v_sales_rep_performance_coaching` - Rep performance metrics
2. `v_deal_risk_dashboard` - Deal risk analysis
3. `v_followup_coaching_dashboard` - Follow-up optimization
4. `v_script_adherence_dashboard` - Script compliance
5. `v_upsell_opportunities_dashboard` - Upsell opportunities

### Functions Created:
1. `update_followup_tracker_on_call()` - Auto-update tracker
2. `calculate_followup_urgency()` - Urgency calculation
3. `is_org_member()` - RLS helper (multi-table compatible)

## Integration Points

- **sales_reps**: Links calls to specific reps
- **leads**: Tracks calls for leads
- **customers**: Links to customer records
- **jobs/roofing_jobs**: Associates calls with jobs
- **organizations**: Org-based access control

## Next Steps (API/Frontend)

1. **Call Recording Integration**
   - Integrate with Twilio/VoIP for call recording
   - Upload audio files to storage
   - Trigger transcription API

2. **AI Scoring Service**
   - Build scoring API endpoint
   - Implement scoring algorithm
   - Analyze transcripts for signals

3. **Dashboard UI**
   - Rep performance dashboard
   - Deal risk alerts
   - Follow-up coaching interface
   - Script adherence reports

4. **Notification System**
   - Alert managers on high-risk deals
   - Notify reps on overdue follow-ups
   - Send coaching note reminders

5. **Analytics & Reporting**
   - Sales heatmaps (what works, what fails)
   - Pattern analysis across all calls
   - Trend identification

## Example Use Cases

### Use Case 1: Rep Performance Review
```sql
SELECT * FROM v_sales_rep_performance_coaching 
WHERE rep_id = '...' 
ORDER BY avg_call_score DESC;
```

### Use Case 2: High-Risk Deal Alerts
```sql
SELECT * FROM v_deal_risk_dashboard 
WHERE risk_level IN ('high', 'critical')
ORDER BY risk_score DESC;
```

### Use Case 3: Follow-Up Coaching
```sql
SELECT * FROM v_followup_coaching_dashboard 
WHERE urgency_level IN ('high', 'critical')
ORDER BY days_since_last_contact DESC;
```

## Impact

This system provides roofers with:
- **Zero Blind Spots**: Every call is recorded and analyzed
- **Data-Driven Coaching**: Reps know exactly where they're weak
- **Prevent Deal Deaths**: Risk detection prevents silent deal losses
- **Revenue Recovery**: Upsell alerts capture missed revenue
- **Consistent Performance**: Script enforcement keeps reps sharp
- **Accountability**: All calls are tracked and scored

## Success Metrics

Roofers will be able to track:
- Average call scores (target: 80+)
- Script adherence rates (target: 90%+)
- Follow-up consistency (target: <4 days between)
- Risk flag resolution (target: 80%+)
- Upsell capture rates (target: 70%+)

---

**Status**: ✅ Database schema complete
**Next**: API endpoints and AI scoring service implementation





















