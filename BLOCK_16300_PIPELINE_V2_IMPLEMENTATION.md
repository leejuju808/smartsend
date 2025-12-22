# Block 16300 — SmartSend Pipeline v2 Implementation

## ✅ Implementation Complete

The True Roofing Sales Pipeline: Insurance Column, Storm Column, Appointment Stage, Re-Quote Stage, Auto-Movement, Value Tracking & Lead Heat Indicators

## 📦 What Was Implemented

### 1. Database Migration ✅
**File**: `supabase/migrations/20250130000001_block16300_pipeline_v2.sql`

**Pipeline Stages (9 Roofing-Specific Columns):**
1. **New Leads** - Just imported or added
2. **Warm Leads** - Not ready yet, some interest, needs follow-up
3. **Hot Leads 🔥** - High potential — urgent replies, interest signals
4. **Appointment Booked** - From scheduler OR direct booking intent
5. **Inspection Completed** - Roofer uploaded photos, wrote notes, or marked complete
6. **Insurance Opportunity** - Claims, adjuster visits, storm damage detected
7. **Quote Sent** - Price has been given, waiting to close
8. **Re-Quote / Revival** - Old quotes revived or waiting for a second try
9. **Not Interested** - Dead leads, wrong person, no interest

**New Tables:**
- `lead_heat_scores` - Lead Heat Score (0-100) tracking with component breakdowns
- `insurance_metadata` - Insurance claim and adjuster information

**New Columns on `contacts`:**
- `pipeline_stage_key` - Current pipeline stage key
- `moved_to_stage_at` - When moved to current stage
- `last_auto_moved_at` - Last automatic movement timestamp
- `auto_move_reason` - Reason for auto-movement
- `last_appointment_at`, `next_appointment_at`, `total_appointments` - Appointment tracking
- `inspection_completed_at`, `inspection_notes` - Inspection tracking
- `quote_amount`, `quote_sent_at`, `quote_pdf_url` - Quote tracking
- `is_requote`, `original_quote_at` - Re-quote tracking
- `follow_up_reminder_date`, `last_follow_up_at` - Follow-up tracking
- `pipeline_warning`, `pipeline_warning_at` - Warning flags

**Functions:**
- `calculate_lead_heat_score(p_contact_id)` - Calculates 0-100 heat score based on multiple factors
- `auto_move_pipeline_stage(p_contact_id, p_trigger_type, p_trigger_data)` - Auto-moves contacts based on triggers
- `create_pipeline_tasks(p_contact_id, p_new_stage_key, p_workspace_id)` - Creates tasks when stage changes
- `check_pipeline_warnings(p_workspace_id)` - Checks for pipeline issues and sets warnings

### 2. API Routes ✅

#### GET `/api/pipeline/board`
- Returns contacts grouped by Pipeline v2 stages
- Includes lead heat scores, insurance metadata, latest messages
- Sorted by heat score within each stage

#### POST `/api/pipeline/move`
- Moves contacts to new pipeline stages
- Supports manual drag & drop and automatic triggers
- Triggers: `reply`, `scheduler`, `quote`, `weather`, `user_action`

#### POST `/api/pipeline/update`
- Updates pipeline-related fields (quotes, appointments, inspections)
- Auto-moves to appropriate stages when fields are updated

### 3. Pipeline Workers ✅

#### POST `/api/cron/pipeline/auto-move`
- Processes replies, scheduler bookings, and storm impacts
- Automatically moves contacts to appropriate stages
- Runs periodically (add to cron schedule)

#### POST `/api/cron/pipeline/update-heat`
- Recalculates lead heat scores for contacts with recent activity
- Updates stale heat scores (>24 hours old)
- Runs periodically (add to cron schedule)

#### POST `/api/cron/pipeline/warnings`
- Checks for pipeline issues across all workspaces
- Sets warning flags for:
  - Leads stuck in Warm > 7 days
  - Quote Sent but no reply in 3 days
  - Insurance lead not booked
  - Storm-affected lead not scheduled
  - Appointment missed but no recovery follow-up

### 4. Auto-Movement Rules ✅

**Reply Brain Triggers:**
- Booking intent → `appointment_booked`
- Adjuster mention → `insurance_opportunity`
- Yes to inspection → `appointment_booked`
- Questions → `warm_leads`
- Storm damage → `hot_leads` or `insurance_opportunity`

**Scheduler Triggers:**
- Booked → `appointment_booked`
- Completed → `inspection_completed`

**Revenue Engine Triggers:**
- Quote created → `quote_sent`
- Old quote revived → `requote_revival`
- Estimate value updated → `hot_leads`

**Weather Engine Triggers:**
- Storm hits → `warm_leads` → `hot_leads`
- Hail risk → `insurance_opportunity`

**User Actions:**
- Add note "sent quote" → `quote_sent`
- Update "closed" → (future v3: Completed Deals)

### 5. Lead Heat Score (0-100) ✅

**Score Components:**
- Reply tone score (0-30) - Positive/urgent language
- Reply keywords score (0-20) - High-intent keywords
- Storm risk score (0-20) - Storm impact and risk level
- Insurance intent score (0-15) - Insurance claims and mentions
- Booking clicks score (0-10) - Appointment activity
- Personalization match score (0-5) - Tags and enrichment

**Heat Levels:**
- 🔥 80-100 = HOT
- 🟡 50-79 = Warm
- 🔵 0-49 = Cold

**Updates Live** based on new data (replies, appointments, storms, etc.)

### 6. Pipeline → Tasks Sync ✅

**Automatic Task Creation:**
- Move to Appointment → "Prepare for Inspection" task
- Move to Quote Sent → "Follow-up on Quote in 48 hours" task
- Move to Insurance → "Upload adjuster date" / "Insurance Support Needed" task
- Move to Inspection Completed → "Send Quote After Inspection" task
- Move to Re-Quote → "Re-engage Old Quote" task

### 7. Pipeline Warnings ✅

**Warning Types:**
- `stuck_in_warm` - Lead stuck in Warm > 7 days
- `quote_no_reply` - Quote Sent but no reply in 3 days
- `insurance_not_booked` - Insurance lead not booked
- `storm_not_scheduled` - Storm-affected lead not scheduled
- `appointment_missed` - Appointment missed but no recovery follow-up

### 8. Insurance Pipeline Logic ✅

**Insurance Stage Features:**
- Automatically filled from:
  - Storm risk
  - Adjuster language in replies
  - Claim info
  - Urgent replies

**Insurance Metadata Tracking:**
- Claim number, adjuster info
- Storm-related insurance detection
- Detection sources (reply, scheduler, weather, manual)

### 9. Re-Quote Stage ✅

**Old Quote Revival Automation:**
- When old quote detected → move to `requote_revival`
- AI suggests re-quote message (future enhancement)
- Tasks ensure follow-up
- Lead heat increases with activity
- Appointment options offered again

## 🔧 Integration Points

Pipeline v2 integrates with:
- **Tasks** - Auto-creates tasks on stage movement
- **Inbox** - Detects intent from replies
- **Scheduler** - Tracks appointments and inspections
- **Templates** - Uses for re-quote suggestions
- **Reply Brain** - Detects intent and triggers auto-movement
- **Weather Engine** - Detects storms and updates stages
- **Revenue Engine** - Tracks quotes and job values

## 📋 Next Steps

1. **Add Cron Jobs** - Add pipeline workers to `vercel.json`:
   ```json
   {
     "path": "/api/cron/pipeline/auto-move?key=${CRON_SECRET}",
     "schedule": "*/10 * * * *"
   },
   {
     "path": "/api/cron/pipeline/update-heat?key=${CRON_SECRET}",
     "schedule": "0 * * * *"
   },
   {
     "path": "/api/cron/pipeline/warnings?key=${CRON_SECRET}",
     "schedule": "0 8 * * *"
   }
   ```

2. **Frontend Components** - Create Pipeline Board UI with:
   - 9 column Kanban board
   - Lead heat score indicators
   - Storm risk badges
   - Insurance badges
   - Drag & drop functionality
   - Filters (storm risk, insurance, home value, quote amount, lead heat, city, neighborhood)
   - Bulk actions (move, follow-up, schedule, mark not interested)

3. **Pipeline Filters** - Implement filtering by:
   - Storm risk
   - Insurance
   - Home value
   - Quote amount
   - Lead heat
   - City
   - Neighborhood
   - User assigned (team)

4. **Bulk Actions** - Add bulk operations:
   - Bulk move
   - Bulk send follow-up
   - Bulk schedule
   - Bulk mark not interested

## 🎯 Why Roofers Will LOVE This

🔥 **1. Pipeline mirrors how roofing ACTUALLY works**
- Not a generic CRM
- 9 stages match real roofing sales cycles

🔥 **2. They feel organized and in control**
- No more scattered leads
- Clear visual pipeline

🔥 **3. Insurance jobs get immediate attention**
- Increases BIG JOB revenue dramatically
- Insurance Toolkit with claim checklist

🔥 **4. Pipeline moves automatically**
- Roofer no longer has to drag everything manually
- Auto-movement based on real triggers

🔥 **5. Lead heat scoring simplifies decision making**
- They know exactly who to prioritize
- Heat score updates live

🔥 **6. Clear path from storm → booking → quote → job**
- The ENTIRE revenue flow visualized
- Auto-tasks ensure nothing falls through cracks

## 📝 Files Created/Modified

**New Files:**
- `supabase/migrations/20250130000001_block16300_pipeline_v2.sql`
- `app/api/pipeline/update/route.ts`
- `app/api/cron/pipeline/auto-move/route.ts`
- `app/api/cron/pipeline/update-heat/route.ts`
- `app/api/cron/pipeline/warnings/route.ts`
- `BLOCK_16300_PIPELINE_V2_IMPLEMENTATION.md`

**Modified Files:**
- `app/api/pipeline/board/route.ts` - Updated for Pipeline v2
- `app/api/pipeline/move/route.ts` - Updated for Pipeline v2

## ✅ Implementation Status

- [x] Database migration with 9 roofing-specific stages
- [x] Lead heat score calculation engine
- [x] Insurance metadata tracking
- [x] Auto-movement functions
- [x] Pipeline → Tasks sync
- [x] Pipeline warnings system
- [x] API routes (board, move, update)
- [x] Pipeline workers (auto-move, update-heat, warnings)
- [ ] Frontend Pipeline Board UI (next step)
- [ ] Pipeline filters (next step)
- [ ] Bulk actions (next step)





















































