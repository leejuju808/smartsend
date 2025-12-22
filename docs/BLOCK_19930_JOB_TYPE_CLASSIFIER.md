# Block 19930 — SmartSend Inbox AI Repair/Replacement Classifier v1

## Overview

This block implements comprehensive AI-powered job type classification for roofing companies. It automatically categorizes homeowner messages into specific job types, detects severity levels, identifies insurance vs retail jobs, and triggers appropriate workflows.

## What's Implemented

### 1. Database Schema ✅

**Migration**: `supabase/migrations/20250130000002_block19930_job_type_classifier_v1.sql`

Added fields to `inbox_threads`:
- `job_type` - Primary job type classification
- `job_subcategory` - Specific subcategory within job type
- `severity_level` - Low, medium, or high severity
- `insurance_vs_retail` - Insurance claim vs retail job classification
- `missing_information` - JSONB array of missing information fields
- `job_type_metadata` - JSONB metadata (confidence scores, keywords, reasoning)
- `job_type_classified_at` - Timestamp of classification

**Analytics Views**:
- `inbox_job_type_revenue` - Revenue breakdown by job type
- `inbox_job_type_summary_30d` - 30-day job type summary
- `inbox_insurance_vs_retail_revenue` - Insurance vs retail breakdown
- `inbox_severity_distribution` - Severity level distribution
- `inbox_missing_information_summary` - Missing information tracking

**Functions**:
- `get_job_type_analytics()` - Get job type analytics for a campaign
- `get_revenue_by_job_type_insurance()` - Revenue by job type and insurance status

### 2. AI Classification Engine ✅

**File**: `src/lib/ai/jobTypeClassifier.ts`

Features:
- 9 primary job types (repair, replacement, emergency leak, storm, insurance, gutter, inspection, question, not roofing)
- Subcategory detection (e.g., chimney leak, hail damage, shingle repair)
- Severity level detection (low, medium, high)
- Insurance vs retail classification
- Missing information detection
- Estimated job value calculation based on job type, severity, and insurance status
- Suggested workflow recommendations

### 3. API Endpoint ✅

**File**: `app/api/inbox-v2/classify-job-type/route.ts`

Endpoint: `POST /api/inbox-v2/classify-job-type`

Accepts:
- `thread_id` - Thread to classify (fetches latest message)
- `text` - Direct text to classify
- `subject` - Optional subject line

Returns:
- Complete classification result
- Updates thread with classification data
- Updates estimated value if needed

### 4. UI Components ✅

**File**: `components/inbox-v2/JobTypeBadges.tsx`

Components:
- `JobTypeBadges` - Full badge display with job type, subcategory, severity, and insurance/retail
- `JobTypeBadgeCompact` - Compact version for thread lists

Features:
- Color-coded badges (blue=retail, purple=insurance, red=emergency, yellow=storm)
- Icons for each job type
- Responsive sizing (sm, md, lg)

### 5. Workflow Triggers ✅

**File**: `src/lib/workflows/jobTypeWorkflows.ts`

Features:
- Automatic workflow selection based on job type
- Workflow actions (tasks, tags, pipeline stages, reply templates)
- Missing information prompts
- Priority setting based on severity

Workflow Types:
- `repair_workflow` - Quick response, repair tech assignment
- `replacement_workflow` - Estimator needed, inspection scheduling
- `insurance_workflow` - Documentation tasks, adjuster meetings
- `storm_workflow` - Priority queue, emergency follow-up
- `inspection_workflow` - Inspection scheduling

### 6. Analytics Component ✅

**File**: `app/(dashboard)/revenue/_components/JobTypeAnalytics.tsx`

Features:
- Job type breakdown with counts and revenue
- Win rate calculation
- Average job value per type
- Visual badges with icons
- Summary statistics

## Usage Examples

### Classify a Thread

```typescript
const response = await fetch('/api/inbox-v2/classify-job-type', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ thread_id: 'thread-uuid' })
})

const { classification } = await response.json()
// classification contains: jobType, severityLevel, insuranceVsRetail, etc.
```

### Display Job Type Badges

```tsx
import { JobTypeBadges } from '@/components/inbox-v2/JobTypeBadges'

<JobTypeBadges
  jobType={thread.job_type}
  jobSubcategory={thread.job_subcategory}
  severityLevel={thread.severity_level}
  insuranceVsRetail={thread.insurance_vs_retail}
  size="md"
/>
```

### Trigger Workflow Actions

```typescript
import { getWorkflowForJobType, getWorkflowActions, executeWorkflowActions } from '@/src/lib/workflows/jobTypeWorkflows'

const workflow = getWorkflowForJobType(
  classification.jobType,
  classification.severityLevel,
  classification.insuranceVsRetail
)

const actions = getWorkflowActions(workflow, threadId, {
  severityLevel: classification.severityLevel,
  insuranceVsRetail: classification.insuranceVsRetail,
  missingInformation: classification.missingInformation
})

await executeWorkflowActions(threadId, actions)
```

## Job Type Categories

### Primary Types
1. **roof_repair** - General repair work
2. **roof_replacement** - Full or partial replacement
3. **emergency_leak_repair** - Active leak requiring immediate attention
4. **storm_damage** - Wind, hail, or weather-related damage
5. **insurance_driven_claim** - Insurance claim involved
6. **gutter_repair_replacement** - Gutter-related work
7. **inspection_only** - Just wants inspection/evaluation
8. **general_question** - General questions about roofing
9. **not_roofing** - Not a roofing-related inquiry

### Subcategories

**Repair Subcategories**:
- shingle_repair
- flashing_repair
- pipe_boot_repair
- skylight_leak
- chimney_leak
- valley_repair
- ridge_cap_issue
- small_patch
- fascia_soffit_damage

**Replacement Subcategories**:
- full_tear_off
- partial_replacement
- old_roof_15plus_years
- worn_shingles
- storm_replacement
- insurance_replacement

**Storm Damage Subcategories**:
- hail
- wind
- tree_limb_impact
- blown_shingles

## Value Estimation

Job values are estimated based on:
- Base range for job type
- Severity multiplier (low: 0.7-1.0x, medium: 1.0-1.3x, high: 1.2-1.8x)
- Insurance multiplier (insurance: 1.2-2.0x, retail: 0.8-1.2x)

Example ranges:
- Leak repair: $150-$350
- Chimney flashing: $600-$900
- Hail replacement: $7,000-$18,000
- Full tear-off: $9,000-$30,000

## Integration Points

### Automatic Classification

To automatically classify threads when new messages arrive, add to your message processing:

```typescript
// In your message processing handler
if (message.direction === 'in') {
  await fetch('/api/inbox-v2/classify-job-type', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: message.thread_id })
  })
}
```

### Thread Header Integration

Add job type badges to thread headers:

```tsx
import { JobTypeBadges } from '@/components/inbox-v2/JobTypeBadges'

<div className="flex items-center gap-2">
  <JobTypeBadges
    jobType={thread.job_type}
    jobSubcategory={thread.job_subcategory}
    severityLevel={thread.severity_level}
    insuranceVsRetail={thread.insurance_vs_retail}
  />
</div>
```

### Revenue Dashboard Integration

Add job type analytics to revenue dashboard:

```tsx
import { JobTypeAnalytics } from '@/app/(dashboard)/revenue/_components/JobTypeAnalytics'

// Fetch job type analytics
const { data } = await supabase.rpc('get_job_type_analytics', {
  p_campaign_id: campaignId,
  p_days: 30
})

<JobTypeAnalytics data={data} dateRange="30d" />
```

## Next Steps

1. **Auto-classification on message arrival** - Integrate classification into message processing pipeline
2. **Workflow execution** - Connect workflow actions to actual task/tag creation systems
3. **Analytics dashboard** - Add job type analytics to revenue dashboard
4. **Thread list integration** - Add job type badges to thread lists
5. **Missing information prompts** - Surface missing information suggestions in UI
6. **Value refinement** - Add zip code pricing data for more accurate value estimates

## Database Queries

### Get Job Type Analytics

```sql
SELECT * FROM get_job_type_analytics('campaign-uuid', 30);
```

### Get Revenue by Job Type and Insurance

```sql
SELECT * FROM get_revenue_by_job_type_insurance('campaign-uuid', 30);
```

### View Job Type Summary

```sql
SELECT * FROM inbox_job_type_summary_30d WHERE campaign_id = 'campaign-uuid';
```

## Notes

- Classification uses GPT-4o-mini for cost efficiency
- Fallback to rule-based classification if AI fails
- Confidence scores included for all classifications
- Missing information detection helps guide conversations
- Workflow suggestions help automate next steps



















































