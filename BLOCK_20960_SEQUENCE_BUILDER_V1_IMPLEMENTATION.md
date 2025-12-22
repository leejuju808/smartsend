# Block 20960 — SmartSend Sequence Builder v1 Implementation

## Overview

Complete implementation of the drag-and-drop sequence builder for SmartSend AI, enabling roofing companies to create sophisticated email sequences with delays, conditions, branching, and AI personalization.

## ✅ Implementation Complete

### 1. Database Schema (`supabase/migrations/20250130000002_block20960_sequence_builder_v1.sql`)

**Tables Created:**
- `campaign_steps` - Stores individual steps in a sequence (email, delay, condition, tag)
- `campaign_logs` - Execution logs for tracking step execution per lead
- `sequence_templates` - Pre-built sequence templates for roofers

**Key Features:**
- Step ordering with `step_order` field
- JSONB `config` field for flexible step configuration
- RLS policies for workspace-based access control
- Helper functions for step reordering

**Pre-Built Templates:**
1. Roof Leak Emergency Flow
2. Hail Damage Inspection Flow
3. Storm Damage Lead Nurture Flow
4. Estimate Follow-Up Flow
5. Insurance Claim Homeowner Education Flow

### 2. API Endpoints

**Sequence Management:**
- `GET /api/campaigns/[id]/steps` - Get all steps for a campaign
- `POST /api/campaigns/[id]/steps` - Create a new step
- `PUT /api/campaigns/[id]/steps/[stepId]` - Update a step
- `DELETE /api/campaigns/[id]/steps/[stepId]` - Delete a step
- `POST /api/campaigns/[id]/steps/reorder` - Reorder steps

**Campaign Publishing:**
- `POST /api/campaigns/[id]/publish` - Publish campaign and initialize sequence logs

**Templates:**
- `GET /api/sequence-templates` - Get available templates
- `POST /api/sequence-templates` - Create custom template

**Execution Engine:**
- `GET /api/cron/sequence-executor` - Background worker (runs every minute)

### 3. Frontend Components

**Main Sequence Builder:**
- `/app/campaigns/[id]/sequence/page.tsx` - Main sequence builder page
- `/app/campaigns/[id]/sequence/SequenceBuilderClient.tsx` - Client component with drag-and-drop

**Step Components:**
- `components/campaigns/v2/sequence/StepCard.tsx` - Step card with drag handle
- `components/campaigns/v2/sequence/StepEditor.tsx` - Step editor panel
- `components/campaigns/v2/sequence/StepSidebar.tsx` - Sidebar for adding steps

**Features:**
- Drag-and-drop reordering using `@dnd-kit`
- Real-time step editing
- Auto-save every 3 seconds
- Step type icons and labels
- Plan-based feature gating UI

### 4. Step Types

**Email Step:**
- Subject and body editing
- AI personalization integration
- Template loading
- Variable support: `{{first_name}}`, `{{city}}`, `{{address}}`, etc.

**Delay Step:**
- Duration selection (hours, days, weeks)
- Recommended delays: 2h, 4h, 24h, 2 days, 3 days, 1 week

**Condition Step:**
- Available in Growth and Domination plans
- Conditions: replied, bounced, hot lead score, insurance email
- Actions: stop, jump to step, switch sequence

**Tag Step:**
- Apply labels to leads
- Common labels: "Not Interested", "Follow Up Later", "Hot Lead"

### 5. Sequence Execution Engine

**Background Worker (`/api/cron/sequence-executor`):**
- Runs every minute via cron
- Processes pending steps where `scheduled_time <= now()`
- Checks for replies, bounces, and campaign status
- Executes steps based on type
- Schedules next step automatically
- Handles delays between steps

**Execution Flow:**
1. Find pending logs
2. Check campaign status (must be published)
3. Check if lead replied (stop sequence)
4. Check if email bounced (stop sequence)
5. Execute step based on type
6. Schedule next step with appropriate delay

### 6. Feature Gating

**Plan Limits:**
- **Starter**: 1 sequence, 500 emails/month, no conditions
- **Growth**: 3 sequences, 2,000 emails/month, conditions available
- **Domination**: Unlimited sequences, unlimited emails, full features

**Enforcement:**
- Server-side checks in publish endpoint
- UI indicators for unavailable features
- Upgrade prompts when limits reached

## Usage

### Creating a Sequence

1. Navigate to `/campaigns/[id]/sequence`
2. Click "Add Step" to add steps
3. Drag steps to reorder
4. Click a step to edit
5. Click "Publish Sequence" when ready

### Adding Steps

1. Click "Add Step" button
2. Select step type from sidebar:
   - Email - Send personalized email
   - Delay - Wait before next step
   - Condition - Branch based on behavior (Growth+)
   - Tag - Apply label to lead
3. Configure step in editor panel
4. Steps auto-save every 3 seconds

### Publishing

1. Ensure campaign has at least one step
2. Click "Publish Sequence"
3. System checks:
   - Sequence limit (based on plan)
   - Email volume limit
   - Campaign has steps
4. On success, sequence starts executing

## Cron Setup

Add to your cron configuration (Vercel or Supabase):

```toml
[cron.jobs.sequence-executor]
schedule = "* * * * *"  # Every minute
endpoint = "/api/cron/sequence-executor"
```

Or in Vercel:

```json
{
  "crons": [
    {
      "path": "/api/cron/sequence-executor",
      "schedule": "* * * * *"
    }
  ]
}
```

## Database Migration

Run the migration:

```bash
supabase db push
```

Or apply manually:
```bash
psql -f supabase/migrations/20250130000002_block20960_sequence_builder_v1.sql
```

## Testing

1. Create a campaign
2. Navigate to sequence builder
3. Add email step
4. Add delay step
5. Add another email step
6. Publish campaign
7. Verify logs are created in `campaign_logs`
8. Wait for cron to execute (or trigger manually)

## Future Enhancements

- SMS step support
- Call reminder step
- AI-generated follow-up step
- Multichannel follow-up
- Advanced branching logic
- Visual sequence flow diagram
- A/B testing for steps
- Step performance analytics

## Notes

- Steps are auto-saved every 3 seconds
- Published campaigns cannot be edited (must pause first)
- Sequence execution respects delays and conditions
- AI personalization is integrated for email steps
- Feature gating prevents unauthorized feature usage
















































