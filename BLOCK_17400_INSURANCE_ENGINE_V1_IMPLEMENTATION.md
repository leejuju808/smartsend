# Block 17400 — SmartSend Insurance Engine v1

**Full Insurance Claim Intelligence: Detection, Claim Timeline, Adjuster Prep, Revenue Forecasting & Insurance-Specific Follow-Up Sequences**

## Overview

Block 17400 transforms SmartSend into the smartest roofing insurance assistant in the industry by automatically detecting, organizing, forecasting, and managing INSURANCE CLAIM LEADS — the highest-value jobs a roofer can close.

## Features Implemented

### 1. ✅ Full Insurance Claim Detection System

SmartSend automatically detects insurance-related language in:
- Replies
- Uploaded PDFs
- Homeowner language
- Tasks
- Photos
- Insurance documents

**Detection Keywords:**
- "claim"
- "adjuster"
- "deductible"
- "ACV / RCV"
- "insurance is coming"
- "filed a claim"
- "meeting the adjuster"

**Auto-Applied Actions:**
- Insurance tag
- Insurance likelihood score
- Insurance pipeline stage
- Insurance revenue estimate
- Insurance timeline

### 2. ✅ Insurance Likelihood Score (0–100)

Calculated based on:
- Storm type
- Severity
- Homeowner language
- Uploaded insurance docs
- Deductible amount
- Neighborhood insurance history
- Appointment scheduling
- Prior claims in ZIP
- Roof type & roof age

**Score Categories:**
- 80–100 = Active Claim
- 60–79 = Strong Likelihood
- 30–59 = Possible Claim
- 0–29 = Low probability

### 3. ✅ ACV / RCV Extraction Engine

Automatically extracts from uploaded documents:
- Deductible
- ACV (Actual Cash Value)
- RCV (Replacement Cost Value)
- Depreciation
- Adjuster name
- Insurance company
- Claim number
- Date of loss

**Auto-Actions:**
- Stores values in insurance_metadata
- Updates job value estimate
- Updates forecast
- Moves pipeline
- Creates tasks

### 4. ✅ Insurance Claim Timeline Generator

SmartSend builds a complete timeline:

**Timeline Stages:**
- Day 0 → Claim filed
- Day 1–3 → Adjuster scheduled
- Day 7 → Adjuster meeting
- Day 14 → Scope received
- Day 21 → Supplement review
- Day 30 → Pending approval
- Day 44 → Approved
- Day 51 → Ready to schedule

**Auto-Actions:**
- Creates tasks
- Schedules reminders
- Sends follow-ups
- Updates pipeline stage

### 5. ✅ Adjuster Prep Kit

**Component:** `components/insurance/AdjusterPrepKit.tsx`

Includes:
- **Checklists:**
  - Roof damage photos
  - Shingle lift
  - Missing shingles
  - Interior leaks
  - Soft metal hits
  - Skylight impacts
  - Drone overview

- **Auto-generated message** for homeowner
- **File upload reminders:**
  - Ladder assist report
  - Measurement notes
  - Satellite measurements

### 6. ✅ Insurance-Specific Follow-Up Sequences

**5 Sequences Based on Timeline Stage:**

1. **Claim Filed** - Empathetic and helpful, explains process, sets inspection date
2. **Adjuster Scheduled** - Prep homeowner, request photos, offer to attend meeting
3. **Scope Received** - Ask for paperwork, offer supplement handling
4. **Pending Approval** - Weekly check-ins, urgency without pressure
5. **Approved** - Move to roof replacement, provide scheduling link

**Auto-Scheduling:**
- Follow-ups automatically scheduled when timeline stage changes
- Templates stored in `followup_templates` table
- Integrated with existing follow-up sequencer

### 7. ✅ Insurance Pipeline Stages

**New Pipeline Stages:**
- Insurance – Claimed
- Insurance – Adjuster Set
- Insurance – Scope Received
- Insurance – Pending Approval
- Insurance – Approved
- Insurance – Ready to Schedule

**Each Stage Includes:**
- Recommended action
- Recommended template
- Tasks
- Revenue forecast

### 8. ✅ Insurance Revenue Engine (Integrated)

**Revenue Calculation Based On:**
- Deductible
- ACV/RCV
- Neighborhood average
- Storm type
- Roof size guess

**Display Format:**
```
Estimated Insurance Revenue: $14,400 – $21,800
```

**Integration:**
- Revenue dashboard
- Contact value
- Forecast
- Job value estimates

### 9. ✅ Insurance Risk Alerts

**Alert Types:**
- "Potential claim stalled: homeowner hasn't replied in 4 days."
- "Adjuster meeting in 24 hours — prep checklist recommended."
- "Scope received with missing line items — supplement possible."
- "Approval pending too long — time to check status."

**Auto-Checking:**
- Risk alerts checked automatically
- Alerts created when conditions are met
- Displayed in contact profile and dashboard

### 10. ✅ Technical Architecture

**Database Tables:**
- `insurance_metadata` - Claim information, ACV/RCV, adjuster details
- `insurance_scores` - Likelihood scores with breakdown
- `insurance_timeline` - Timeline stages and dates
- `insurance_documents` - Uploaded documents with extracted data
- `insurance_events` - Event log for audit trail
- `insurance_pipeline_stages` - Custom pipeline stages
- `insurance_risk_alerts` - Risk alerts

**Workers/Edge Functions:**
- `/insurance/detect` - Insurance detection worker
- `/insurance/updateTimeline` - Timeline updates
- `/insurance/extractDocuments` - Document extraction
- `/insurance/supplementCheck` - Supplement checking

**API Routes:**
- `GET /api/insurance/contact/[id]` - Get insurance data for contact
- `PATCH /api/insurance/contact/[id]` - Update insurance metadata
- `POST /api/insurance/addDocument` - Add insurance document
- `POST /api/insurance/detect` - Trigger insurance detection
- `GET /api/insurance/alerts` - Get risk alerts
- `PATCH /api/insurance/alerts` - Resolve alerts

**Database Functions:**
- `detect_insurance_keywords()` - Keyword detection
- `calculate_insurance_likelihood_score()` - Score calculation
- `generate_insurance_timeline()` - Timeline generation
- `auto_apply_insurance_detection()` - Auto-apply detection
- `extract_insurance_document_data()` - Document extraction
- `check_insurance_risk_alerts()` - Risk alert checking
- `get_insurance_followup_template()` - Get follow-up template
- `schedule_insurance_followup()` - Schedule follow-up

## Database Migration Files

1. `20250130000002_block_17400_insurance_engine_v1.sql` - Core insurance tables and functions
2. `20250130000003_block_17400_insurance_followup_sequences.sql` - Follow-up sequences

## Components

1. `components/insurance/AdjusterPrepKit.tsx` - Adjuster prep kit component

## Why Roofers Will LOVE This

🔥 **1. It manages their MOST profitable jobs**
- Insurance = biggest revenue source

🔥 **2. Removes confusion and chaos**
- They always know the next step

🔥 **3. Auto-detected insurance language is MAGIC**
- Feels futuristic

🔥 **4. Extracts real numbers from paperwork**
- Insane time saver

🔥 **5. Timeline automation improves win rate**
- Roofers stay on top of claims

🔥 **6. Insurance revenue estimates boost confidence**
- They see BIG job values

## Usage Examples

### Auto-Detection
Insurance is automatically detected when:
- Homeowner mentions "claim" or "adjuster" in a reply
- Insurance document is uploaded
- PDF contains insurance keywords

### Manual Detection
```typescript
// Trigger detection for a contact
POST /api/insurance/detect
{
  "contact_id": "uuid",
  "text": "I filed a claim with my insurance",
  "source": "manual"
}
```

### Get Insurance Data
```typescript
// Get all insurance data for a contact
GET /api/insurance/contact/[id]

// Returns:
{
  metadata: {...},
  score: {...},
  timeline: [...],
  current_stage: {...},
  documents: [...],
  events: [...],
  alerts: [...]
}
```

### Add Insurance Document
```typescript
// Add and extract insurance document
POST /api/insurance/addDocument
{
  "contact_id": "uuid",
  "attachment_id": "uuid",
  "document_type": "scope_of_loss",
  "file_name": "scope.pdf"
}
```

## Next Steps

1. **Deploy migrations** to production
2. **Set up cron job** for insurance detection worker (runs hourly)
3. **Integrate AdjusterPrepKit** into contact profile pages
4. **Test insurance detection** with sample messages
5. **Configure follow-up sequences** per workspace preferences

## Integration Points

- **Revenue Engine v2** - Insurance revenue estimates integrated
- **Pipeline V2** - Insurance pipeline stages added
- **Follow-Up Sequencer V2** - Insurance-specific sequences
- **Tasks System** - Auto-created tasks for timeline stages
- **Attachments System** - Insurance document storage and extraction

## Notes

- Insurance detection runs automatically via trigger on message insert
- Timeline is auto-generated when insurance score >= 60
- Follow-ups are auto-scheduled when timeline stage changes
- Risk alerts are checked periodically (via worker or manual trigger)





















































