# Block 17600 — SmartSend Contact Priority Engine v1 Implementation

## Overview
The Contact Priority Engine is the master brain that tells roofers EXACTLY which leads they should work first — automatically ranked by urgency, job type, money potential, storm severity, insurance likelihood, appointment status, open messages, neglected replies, and task deadlines.

## Implementation Summary

### ✅ Database Schema
**File:** `supabase/migrations/20250130000001_block17600_contact_priority_engine_v1.sql`

#### Core Tables Created:
1. **`priority_scores`** - Master table storing final priority score and all component scores
   - `priority_score` (0-100): Final weighted score
   - `priority_band`: priority_1 (95-100), priority_2 (85-94), priority_3 (70-84), priority_4 (50-69), priority_5 (0-49)
   - Component scores: heat_score, urgency_score, insurance_value_score, storm_risk_score, money_potential_score, engagement_score
   - `priority_reason`: Human-readable explanation
   - `next_action`: Recommended action
   - `is_neglected`: Flag for high-priority leads that haven't been touched
   - `hours_since_last_touch`, `days_since_last_reply`: Neglect tracking

2. **`urgency_scores`** - Detailed urgency tracking
   - Tracks: leaks, storm damage, interior stains, urgent language, weather forecast, insurance deadlines

3. **`engagement_scores`** - Detailed engagement tracking
   - Tracks: unread messages, unanswered questions, last touched time, open tasks, pending booking

#### Database Functions Created:

1. **`calculate_heat_score(contact_id)`** - Calculates Heat Score (0-100)
   - Based on: reply tone, engagement, behavior, clicks, opens, positive signals, intent words
   - Components: Reply tone (0-30), Intent keywords (0-25), Engagement (0-25), Recent activity (0-20)

2. **`calculate_urgency_score(contact_id)`** - Calculates Urgency Score (0-100)
   - Based on: leaks, storm damage, interior stains, "urgent" language, weather forecast, storm proximity, insurance deadlines
   - Leak mentions: +30, Storm damage: +25, Interior stains: +20, Urgent language: +15, Insurance deadlines: +20, Recent storms: +15

3. **`calculate_insurance_value_score(contact_id)`** - Calculates Insurance Value Score (0-100)
   - Base score for having claim: 30
   - Claim filed: +15, Claim pending: +10, Claim approved: +20
   - Adjuster set: +15
   - ACV/RCV extracted: +15-20
   - High-value claim boost: +5-10
   - Storm-related: +10

4. **`calculate_storm_risk_score(contact_id)`** - Calculates Storm Risk Score (0-100)
   - Based on: hail size, wind speeds, storm distance, date of last storm, number of hits in ZIP
   - Base for having storms: 20
   - Multiple storms: +10-30
   - Hail size boost: +10-25
   - Wind speed boost: +10-20
   - Recent storm (7 days): +15

5. **`calculate_money_potential_score(contact_id)`** - Calculates Money Potential Score (0-100)
   - From revenue engine: roof size guess, home value, type of job, expected payout
   - $30K+ = 100, $20K+ = 80, $15K+ = 60, $10K+ = 40, $5K+ = 20, <$5K = 10
   - Job type boost: replacement (+60), insurance_claim (+70), storm_damage (+50)
   - Home value boost: $500K+ (+10), $300K+ (+5)

6. **`calculate_engagement_score(contact_id)`** - Calculates Engagement Score (0-100)
   - Based on: unread messages, unanswered questions, last touched time, open tasks, pending booking
   - Unread messages: +20-30
   - Open tasks: +10-20
   - Pending booking: +25
   - Recent activity: +10-25

7. **`calculate_priority_score(contact_id)`** - Calculates Final Priority Score (0-100)
   - Weighted Average:
     - Insurance Value: 30%
     - Heat Score: 25%
     - Storm Risk: 20%
     - Urgency: 15%
     - Money Potential: 5%
     - Engagement: 5%

8. **`calculate_contact_priority(contact_id)`** - Main function that calculates and stores all scores
   - Calculates all component scores
   - Determines priority band
   - Generates priority reason and next action
   - Detects neglect (high priority but no reply in 24+ hours)
   - Upserts into `priority_scores` table

9. **`recalculate_workspace_priority_scores(workspace_id)`** - Bulk recalculation for workspace

#### Triggers:
- Auto-calculate priority when contact is updated (INSERT or UPDATE on contacts table)

#### RLS Policies:
- Users can view priority scores for contacts in their workspace

### ✅ API Endpoints
**Files:** 
- `app/api/priority/top/route.ts`
- `app/api/priority/contact/[id]/route.ts`

#### GET `/api/priority/top`
Returns top N leads by priority score.

**Query Parameters:**
- `limit`: Number of leads to return (default: 10)
- `workspace_id`: Workspace ID (optional, uses user's workspace if not provided)
- `priority_band`: Filter by priority band (priority_1, priority_2, etc.)
- `high_value_only`: Only show $15K+ jobs (default: false)

**Response:**
```json
{
  "leads": [
    {
      "id": "contact_id",
      "name": "Sarah M.",
      "email": "sarah@example.com",
      "score": 98,
      "priority_band": "priority_1",
      "reason": "Insurance claim + storm hit + urgent reply",
      "next_action": "Follow up on insurance claim",
      "is_neglected": false,
      "component_scores": {
        "heat": 85,
        "urgency": 90,
        "insurance_value": 95,
        "storm_risk": 80,
        "money_potential": 75,
        "engagement": 70
      },
      "contact_details": {
        "estimated_value_min": 20000,
        "estimated_value_max": 35000,
        "job_type": "insurance_claim",
        "pipeline_stage_key": "insurance_opportunity",
        "next_appointment_at": "2025-02-01T10:00:00Z",
        "quote_amount": 28000
      }
    }
  ],
  "count": 10,
  "workspace_id": "workspace_id"
}
```

#### GET `/api/priority/contact/[id]`
Returns priority score for a specific contact. Automatically recalculates if score is stale (older than 1 hour).

**Response:**
```json
{
  "contact_id": "contact_id",
  "priority_score": 92,
  "priority_band": "priority_2",
  "component_scores": {
    "heat": 85,
    "urgency": 90,
    "insurance_value": 95,
    "storm_risk": 80,
    "money_potential": 75,
    "engagement": 70
  },
  "priority_reason": "Insurance claim + storm hit + urgent reply",
  "next_action": "Follow up on insurance claim",
  "is_neglected": false,
  "hours_since_last_touch": 2.5,
  "days_since_last_reply": 0.1,
  "last_calculated_at": "2025-01-30T12:00:00Z",
  "recalculated": false
}
```

#### POST `/api/priority/contact/[id]`
Manually trigger priority recalculation for a contact.

### ✅ Background Worker
**File:** `app/api/cron/priority/recalculate/route.ts`

**Endpoint:** `POST /api/cron/priority/recalculate`

**Strategy:**
1. Update contacts with recent activity (replies, appointments, storms, insurance updates) - last 7 days
2. Update stale priority scores (older than 24 hours)
3. Update high-priority contacts more frequently (every 6 hours)
4. Update neglected high-priority leads (priority_1 and priority_2 that are neglected)

**Authentication:** Requires `x-cron-secret` header matching `CRON_SECRET` environment variable.

**Response:**
```json
{
  "success": true,
  "updated": 150,
  "errors": 0,
  "timestamp": "2025-01-30T12:00:00Z"
}
```

### ✅ Dashboard Component
**File:** `components/dashboard/Top10LeadsTodayWidget.tsx`

**Component:** `<Top10LeadsTodayWidget />`

**Features:**
- Shows top 10 leads ranked by priority score
- Displays priority band with color coding:
  - Priority 1 (95-100): Red
  - Priority 2 (85-94): Orange
  - Priority 3 (70-84): Yellow
  - Priority 4 (50-69): Blue
  - Priority 5 (0-49): Gray
- Shows priority reason and next action
- Highlights neglected leads (orange border)
- Displays estimated value, job type, location
- Auto-refreshes every 5 minutes
- Links to contact detail page

**Usage:**
```tsx
import { Top10LeadsTodayWidget } from "@/components/dashboard/Top10LeadsTodayWidget";

// In dashboard page
<Top10LeadsTodayWidget />
```

## Priority Bands

- **🔥 Priority 1 (95-100)**: Insurance claims, urgent leaks, strong reply intent, high value, storm hit + homeowner replied
- **🔥 Priority 2 (85-94)**: Replied and interested, storm affected, bookable window, needs follow-up, has photos
- **Priority 3 (70-84)**: Warm replies, asked a question, hasn't booked yet
- **Priority 4 (50-69)**: Opened but didn't reply, cold but worth nudging
- **❄️ Priority 5 (0-49)**: Low potential

## Integration Points

### Dashboard Integration
Add to dashboard page:
```tsx
import { Top10LeadsTodayWidget } from "@/components/dashboard/Top10LeadsTodayWidget";

<Top10LeadsTodayWidget />
```

### Inbox Integration (TODO)
- Add priority filters: Priority 1, Priority 2, Warm, Cold, Insurance, Storm, Needs Reply
- Sort inbox threads by priority score

### Pipeline Integration (TODO)
- Sort pipeline columns by priority score (highest to lowest)
- Show priority score badge on each contact card

### Alerts System (TODO)
- Alert: "High-Priority Lead Unreplied (Score 91)"
- Alert: "Insurance Lead Overdue (Score 95)"
- Alert: "Storm Lead Ignored for 24 hours (Score 88)"
- Alert: "Booking Opportunity Missed (Score 90)"

### Show Me My Money Mode (TODO)
- Filter: "💰 Prioritize High-Value Jobs"
- Shows only: $15K+ jobs, insurance opportunities, storm hot zones, replacement-friendly roofs

## Next Steps

1. ✅ Database migration created
2. ✅ API endpoints created
3. ✅ Background worker created
4. ✅ Dashboard widget created
5. ⏳ Add priority filters to inbox component
6. ⏳ Update pipeline view to sort by priority score
7. ⏳ Create priority alerts system
8. ⏳ Create "Show Me My Money" mode filter
9. ⏳ Add priority score display to contact detail pages
10. ⏳ Set up cron job schedule (recommend: every 6 hours)

## Cron Job Setup

Add to your cron scheduler (e.g., Vercel Cron, GitHub Actions, etc.):

```
# Recalculate priority scores every 6 hours
0 */6 * * * curl -X POST https://your-domain.com/api/cron/priority/recalculate \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

## Testing

1. Run migration: `supabase migration up`
2. Test API endpoints:
   - `GET /api/priority/top?limit=10`
   - `GET /api/priority/contact/{contact_id}`
   - `POST /api/priority/contact/{contact_id}`
3. Test cron job:
   - `POST /api/cron/priority/recalculate` with `x-cron-secret` header
4. Add widget to dashboard and verify it displays correctly

## Notes

- Priority scores are calculated automatically when contacts are updated
- Scores are recalculated on-demand via API or via cron job
- High-priority contacts (priority_1, priority_2) are recalculated more frequently (every 6 hours)
- Neglected high-priority leads are flagged and prioritized for recalculation
- The system uses weighted averages to ensure insurance and storm-related leads rise to the top





















































