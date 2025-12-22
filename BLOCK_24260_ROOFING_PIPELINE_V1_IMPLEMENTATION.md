# Block 24260 — SmartSend Roofing Job Pipeline v1 Implementation

## Overview

This implementation creates the **Roofing Job Pipeline** that transforms SmartSend from a "cold email tool" into a roofing operating system. Every detail exists to help roofers:
- ✔ close more jobs
- ✔ stay organized
- ✔ stop losing money
- ✔ visualize revenue
- ✔ move homeowners toward "YES"

## Implementation Summary

### 1. Database Schema (`20250203000000_block_24260_roofing_pipeline_v1.sql`)

**New Columns on `leads` table:**
- `roofing_pipeline_stage` - The 6 pipeline stages (lead_in, inspection_set, quote_sent, approved, scheduled, installed)
- `estimated_job_value` - Revenue estimate for the job
- `job_type` - repair or replacement
- `payment_type` - insurance or cash
- `close_probability` - 0-100% probability of closing
- `lead_status` - HOT, WARM, or COLD
- `roofing_tags` - JSONB array of tags (storm, insurance, repair, replacement)
- `address`, `city`, `state`, `zip_code` - Full address fields
- `stage_entered_at` - When lead entered current stage
- `last_reply_at`, `last_contact_at` - Contact tracking
- Stage-specific timestamps: `inspection_scheduled_at`, `quote_sent_at`, `approved_at`, `scheduled_at`, `installed_at`

**New Tables:**
- `pipeline_movements` - Audit log of all stage movements (automatic and manual)
- `roofing_pipeline_metrics` - Materialized view for dashboard metrics

**New Functions:**
- `move_lead_to_pipeline_stage()` - Centralized function for moving leads with audit logging
- `auto_move_lead_from_reply()` - Automatically moves leads based on reply content
- `auto_tag_lead_status()` - Automatically tags leads as HOT/WARM/COLD

### 2. API Endpoints

**`/api/pipeline/roofing/board`** (GET)
- Returns leads grouped by pipeline stage
- Includes all metrics (value, probability, status, tags)
- Intelligently sorted by priority (HOT → Value → Probability)

**`/api/pipeline/roofing/metrics`** (GET)
- Returns dashboard metrics:
  - Counts per stage
  - Total estimated revenue
  - Revenue won this month
  - HOT/WARM/COLD breakdown

**`/api/pipeline/roofing/move`** (POST)
- Moves a lead to a new pipeline stage
- Validates stage and workspace access
- Uses database function for atomic updates

### 3. React Components

**`RoofingPipelineBoard.tsx`**
- Main Kanban board component
- Drag-and-drop using `@hello-pangea/dnd`
- 6 columns for each pipeline stage
- Real-time updates via SWR

**`RoofingLeadCard.tsx`**
- Displays lead information in cards
- Shows: name, address, value, probability, status, tags
- Color-coded by HOT/WARM/COLD status

**`RoofingPipelineMetrics.tsx`**
- Dashboard metrics above the board
- Shows counts per stage, revenue totals, status breakdown

**`RoofingLeadDetailDrawer.tsx`**
- Full lead detail view
- Allows stage updates
- Shows all lead information and timeline

### 4. Automated Follow-Ups (`20250203000001_block_24260_roofing_pipeline_followups.sql`)

**Follow-up Sequences:**
- **Inspection Set** → Reminder 24h before inspection
- **Quote Sent** → Follow-up after 2 days, then 7 days
- **Approved** → Immediate scheduling offer
- **Scheduled** → Reminder 24h before install
- **Installed** → Review request after 3 days, referral request after 7 days

**Auto-Scheduling:**
- Trigger automatically fires when `roofing_pipeline_stage` changes
- Follow-ups are scheduled in `roofing_pipeline_followups` table
- Can be processed by a background job/cron

### 5. Page Route

**`/app/(dashboard)/pipeline/roofing/page.tsx`**
- Main page route for the roofing pipeline
- Renders `RoofingPipelineBoard` component

## The 6 Pipeline Stages

1. **Lead In** - New lead from email replies, forms, imports, integrations
2. **Inspection Set** - Homeowner requested inspection, appointment scheduled
3. **Quote Sent** - Estimate/proposal sent to homeowner
4. **Approved** - Homeowner said YES, deposit taken
5. **Scheduled** - Job on calendar, crew assigned, materials ordered
6. **Installed** - Job completed, ready for review/referral campaigns

## Auto-Movement Rules

SmartSend automatically moves leads when:

- **Homeowner requests inspection** → Move to Inspection Set
- **Inspection completed** → Prompt to send quote
- **Homeowner asks about pricing** → Move to Quote Sent
- **Homeowner replies "Yes, let's do it"** → Move to Approved
- **Calendar event created** → Move to Scheduled
- **Job marked complete** → Move to Installed

## Visual Pipeline Features

- **Kanban Board** - Drag-and-drop interface
- **Color-Coded Stages** - Each stage has distinct colors
- **Status Badges** - HOT/WARM/COLD indicators
- **Value Display** - Shows estimated revenue per lead
- **Probability Scores** - Close probability percentage
- **Tags** - Storm, insurance, repair, replacement tags
- **Timeline** - Days in stage, days since last contact

## Dashboard Metrics

Above the board, roofers see:
- Leads In count
- Inspections Set count
- Quotes Sent count
- Approved Jobs count
- Scheduled Jobs count
- Installed Jobs count
- Total Estimated Revenue
- Revenue Won This Month
- HOT/WARM/COLD breakdown

## How This Increases Retention + Upgrades

Roofers will stay subscribed when:
- ✔ SmartSend organizes their business
- ✔ They SEE jobs move forward
- ✔ SmartSend books inspections automatically
- ✔ They close more jobs
- ✔ They stop losing leads
- ✔ Everything is in one place
- ✔ They feel like SmartSend is their office manager

The pipeline pushes roofers into:
- **Growth** → for multiple campaigns
- **Domination** → for unlimited campaigns + automation
- **Storm Add-On** → for storm-heavy markets

## How This Makes SmartSend Recession-Proof

During slow seasons:
- Lead In decreases
- Revival campaigns matter more
- Follow-up becomes critical
- Roofers want more pipeline visibility
- SmartSend becomes THE tool that helps roofers survive downturns

They will NEVER cancel once this pipeline becomes their daily workflow.

## Next Steps

1. **Run Migrations:**
   ```bash
   # Apply database migrations
   supabase migration up
   ```

2. **Test Pipeline:**
   - Navigate to `/pipeline/roofing`
   - Create test leads
   - Move leads between stages
   - Verify auto-movement rules

3. **Set Up Follow-Up Processing:**
   - Create cron job or edge function to call `send_scheduled_pipeline_followups()`
   - Integrate with email sending service

4. **Customize Templates:**
   - Update follow-up email templates in `email_templates` table
   - Customize messages per workspace

5. **Add Integrations:**
   - Connect with Roofr/AccuLynx for automatic quote detection
   - Sync with Google Calendar for scheduling
   - Integrate with CRM systems

## Files Created

### Database Migrations
- `supabase/migrations/20250203000000_block_24260_roofing_pipeline_v1.sql`
- `supabase/migrations/20250203000001_block_24260_roofing_pipeline_followups.sql`

### API Routes
- `app/api/pipeline/roofing/board/route.ts`
- `app/api/pipeline/roofing/metrics/route.ts`
- `app/api/pipeline/roofing/move/route.ts`

### React Components
- `components/pipeline/RoofingPipelineBoard.tsx`
- `components/pipeline/RoofingLeadCard.tsx`
- `components/pipeline/RoofingPipelineMetrics.tsx`
- `components/pipeline/RoofingLeadDetailDrawer.tsx`

### Page Routes
- `app/(dashboard)/pipeline/roofing/page.tsx`

## Notes

- The pipeline uses `roofing_pipeline_stage` column (separate from existing `pipeline_stage`)
- All existing leads are initialized to `lead_in` stage
- Auto-movement rules can be extended via the `auto_move_lead_from_reply()` function
- Follow-up sequences are automatically scheduled but need a background processor to send emails
- The system is designed to be extensible - new stages or follow-up types can be added easily






































