# Block 20620 — SmartSend Roofing CRM Sync v1 Implementation

## 🎯 Mission

This block makes SmartSend feel less like "a smart inbox" and more like a mini roofing CRM that runs itself.

**Up to now we built:**
- 20360 – Insurance Brain
- 20380 – Attachment Parser
- 20400 – Install-Ready Playbook
- 20430 – Hot Lead Priority
- 20460 – Claim Journey Map
- 20490 – AI Estimator
- 20520 – Proposal Builder
- 20560 – Proposal Sender
- 20590 – Adjuster Engine

**20620 is the glue that keeps the pipeline updated automatically** so roofers don't have to drag cards around in a CRM all day.

---

## ✅ Implementation Complete

### 1. Database Migration (`20250201000002_block20620_roofing_crm_sync_v1.sql`)

#### Core Tables Created:

**A) `roofing_jobs` Table**
- One job per property/claim
- Links to `leads`, `threads`, `contacts`, and `campaigns`
- Stores pipeline state with `current_stage` enum
- Tracks hot lead score, projected job value, carrier, claim number
- Auto-updated by triggers from other blocks

**B) `crm_sync_status` Table**
- Designed for future external CRM integration (JobNimbus, HubSpot, Salesforce)
- Tracks sync status per job per external system
- Not implemented yet - structure ready for v2/v3

#### Pipeline Stages Enum:
```sql
roofing_job_stage: 
  NEW_LEAD → CLAIM_FILED → ADJUSTER_SCHEDULED → CLAIM_PENDING → 
  CLAIM_APPROVED → INSTALL_READY → SCHEDULED_INSTALL → 
  IN_PROGRESS → COMPLETED
  (or LOST / NOT_A_FIT)
```

### 2. Auto-Stage Movement Logic

#### Triggers Created:

**A) New Lead Detection**
- `trigger_create_job_on_new_lead()` - Auto-creates job when email with roofing keywords arrives
- Keywords: "hail damage", "roof leak", "storm damage", "roof replacement", etc.

**B) Claim Status Updates (from Block 20360)**
- `trigger_update_job_stage_on_claim_status()` - Auto-updates stage when claim status changes
- Maps claim statuses to pipeline stages:
  - `claim_filed_awaiting_adjuster` → `CLAIM_FILED`
  - `adjuster_visit_scheduled` → `ADJUSTER_SCHEDULED`
  - `under_review` → `CLAIM_PENDING`
  - `approved` / `approved_acv_only` → `CLAIM_APPROVED`
  - `denied` → `LOST`

**C) Install-Ready Detection (from Block 20400)**
- `trigger_update_job_stage_on_install_ready()` - Moves to `INSTALL_READY` when install-ready flag becomes true

**D) Proposal Events (from Blocks 20520/20560)**
- `trigger_update_job_stage_on_proposal_sent()` - Tracks when proposal is sent
- `trigger_update_job_stage_on_proposal_approved()` - Moves to `SCHEDULED_INSTALL` when proposal approved, `IN_PROGRESS` when won, `LOST` when rejected

### 3. Helper Functions

#### Job Management:
- `get_or_create_roofing_job()` - Gets existing job or creates new one, auto-populates from thread/lead/contact data
- `update_roofing_job_stage()` - Updates job stage and creates timeline event
- `sync_job_from_thread()` - Syncs job data from thread (for manual refresh)

#### Manual Stage Transitions:
- `mark_job_scheduled_install()` - Manually mark job as scheduled (for calendar integration)
- `mark_job_in_progress()` - Manually mark job as started
- `mark_job_completed()` - Manually mark job as done
- `mark_job_lost()` - Manually mark job as lost

#### UI Helpers:
- `get_smart_actions_for_stage()` - Returns recommended actions based on current stage
- `get_roofing_job_summary()` - Returns complete job summary with insurance, scope, financials, and smart actions
- `backfill_roofing_jobs_from_threads()` - Backfills jobs from existing threads (run manually after migration)

### 4. Pipeline Views

**A) `roofing_jobs_pipeline_view`**
- Complete pipeline view with all job details
- Includes homeowner name, address, carrier, claim number, stage, hot lead score, projected value
- Links to thread, contact, and lead data

**B) `roofing_jobs_by_stage`**
- Aggregated view of jobs by stage
- Shows job count, total value, average hot score per stage
- Used for pipeline metrics/KPIs

### 5. Smart Actions System

Based on `current_stage`, SmartSend suggests 1-2 main actions:

- **NEW_LEAD** → "Call for inspection" / "Send intro email"
- **CLAIM_FILED** → "Prep adjuster visit email"
- **ADJUSTER_SCHEDULED** → "Follow up with homeowner"
- **CLAIM_PENDING** → "Follow up with adjuster"
- **CLAIM_APPROVED** → "Generate estimate/proposal"
- **INSTALL_READY** → "Call now" / "Send scheduling email"
- **SCHEDULED_INSTALL** → "Confirm materials & crew"
- **IN_PROGRESS** → "Add photos (v2)"
- **COMPLETED** → "Send review request (v2)"
- **LOST** → "Tag and archive"

### 6. Integration with Other Blocks

**Reads from:**
- Block 20360: Claim status, carrier, deductible, payout type
- Block 20380: Scope & financials (RCV, ACV, line items)
- Block 20400: Install-ready flag
- Block 20430: Hot lead score
- Block 20460: Timeline events (creates events on stage changes)
- Block 20490: AI estimate value
- Block 20520: Proposal status (approved/won/rejected)
- Block 20560: Proposal sent tracking

**Writes to:**
- `roofing_jobs.current_stage` - Pipeline stage
- `roofing_jobs.projected_job_value` - RCV or AI estimate
- `roofing_jobs.hot_lead_score` - From block 20430
- `insurance_timeline_events` - Stage transition events (via block 20460)

### 7. Row-Level Security (RLS)

- Jobs readable/updatable by campaign owners, members, and shared users
- Follows same pattern as `inbox_threads` RLS policies
- Supports campaign ownership, campaign shares, and campaign members

---

## 🧠 How Block 20620 Helps Roofing Companies

**Roofers hate juggling:**
- Whiteboards
- Job folders
- Spreadsheets
- Group texts
- CRMs they never update

**So they:**
- Forget leads
- Lose track of claims
- Miss install-ready homeowners
- Don't know how much work is in the pipeline
- Have chaos between office and crews

**SmartSend Roofing CRM Sync v1 fixes this:**
- ✅ Automatically builds a job pipeline
- ✅ Automatically moves leads through stages
- ✅ Automatically sets job value
- ✅ Shows them which jobs are close to install
- ✅ Keeps everything in ONE place, tied to the inbox

**It makes SmartSend feel like:**
> "My whole insurance pipeline, already organized, without me doing anything."

Perfect for owner-led roofing companies.

---

## 🔥 Next Block

**Block 20650 — SmartSend Roofing Revenue Dashboard v1**

(Shows pipeline value, approved claim totals, projected installs, and money on the table)

This will:
- Sum all jobs by stage
- Show "Money in Approved Claims"
- Show "Money in Installed Jobs"
- Show "Money Waiting in Supplements"
- Show live KPIs for roofers

---

## 📝 Usage Examples

### Get Job Summary
```sql
SELECT public.get_roofing_job_summary('job-uuid-here');
```

### Get Smart Actions
```sql
SELECT public.get_smart_actions_for_stage('job-uuid-here');
```

### Manually Mark Job as Scheduled
```sql
SELECT public.mark_job_scheduled_install(
  'job-uuid-here',
  '2025-02-15'::date,
  'Scheduled for next week'
);
```

### View Pipeline by Stage
```sql
SELECT * FROM public.roofing_jobs_by_stage;
```

### View All Jobs in Pipeline
```sql
SELECT * FROM public.roofing_jobs_pipeline_view
WHERE campaign_id = 'campaign-uuid-here'
ORDER BY 
  CASE current_stage
    WHEN 'NEW_LEAD' THEN 1
    WHEN 'INSTALL_READY' THEN 6
    WHEN 'COMPLETED' THEN 9
    ...
  END,
  hot_lead_score DESC NULLS LAST;
```

### Backfill Jobs from Existing Threads
```sql
SELECT public.backfill_roofing_jobs_from_threads('campaign-uuid-here');
```

---

## 🎯 Key Features

1. **Automatic Pipeline Management** - No manual card dragging needed
2. **Event-Driven Updates** - Stages update automatically based on emails, claim status, proposals
3. **Smart Actions** - Context-aware recommendations per stage
4. **Complete Job View** - All data in one place (insurance, scope, financials, timeline)
5. **Future-Ready** - CRM sync structure ready for external integrations (v2/v3)
6. **Backfill Support** - Can populate jobs from existing threads

---

## 📊 Database Schema Summary

**Tables:**
- `roofing_jobs` - Main pipeline table (one per property/claim)
- `crm_sync_status` - Future external CRM sync tracking

**Enums:**
- `roofing_job_stage` - 11 pipeline stages

**Views:**
- `roofing_jobs_pipeline_view` - Complete job details for UI
- `roofing_jobs_by_stage` - Aggregated metrics by stage

**Functions:**
- Job management: `get_or_create_roofing_job()`, `update_roofing_job_stage()`, `sync_job_from_thread()`
- Manual transitions: `mark_job_scheduled_install()`, `mark_job_in_progress()`, `mark_job_completed()`, `mark_job_lost()`
- UI helpers: `get_smart_actions_for_stage()`, `get_roofing_job_summary()`
- Backfill: `backfill_roofing_jobs_from_threads()`

**Triggers:**
- Auto-create job on new lead
- Auto-update stage on claim status change
- Auto-update stage on install-ready
- Auto-update stage on proposal events
















































