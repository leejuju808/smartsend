# Retry Failed Jobs Feature

This feature allows you to re-queue failed jobs from a campaign with optional filtering by lead IDs.

## Setup

### 1. Database Migration (Optional)

Run the SQL migration to add retry tracking columns:

```sql
-- Track lineage + attempts
alter table campaign_send_queue
  add column if not exists retried_from uuid references campaign_send_queue(id) on delete set null,
  add column if not exists retry_count int not null default 0;

create index if not exists idx_send_queue_failed_campaign
  on campaign_send_queue (campaign_id, status)
  where status = 'failed';

-- Add metadata column for retry info (if not exists)
alter table campaign_send_queue
  add column if not exists metadata jsonb default '{}';
```

Or apply the migration file:
```bash
# In Supabase SQL Editor, run the migration
# supabase/migrations/20250104000000_add_retry_tracking.sql
```

### 2. API Route

The API route is already created at `src/app/api/queue/retry-failed/route.ts`.

**Usage:**
```bash
POST /api/queue/retry-failed
Content-Type: application/json

{
  "campaign_id": "uuid",
  "lead_ids": ["uuid1", "uuid2"],  // optional
  "limit": 100,                    // optional, default 100
  "stagger_seconds": 2             // optional, default 2
}
```

**Response:**
```json
{
  "ok": true,
  "requeued": 5
}
```

### 3. UI Component

The `RetryFailedButton` component is available at `src/components/queue/RetryFailedButton.tsx`.

**Basic Usage:**
```tsx
import RetryFailedButton from '@/components/queue/RetryFailedButton';

// On a Campaign page
<RetryFailedButton
  campaignId={campaign.id}
  onDone={() => refetchDashboard()}
/>
```

**With Selected Leads:**
```tsx
<RetryFailedButton
  campaignId={campaign.id}
  selectedLeadIds={selectedRowIds}
  onDone={() => {
    mutate(`/api/dashboard/metrics?workspace_id=${workspaceId}`);
    refetchQueue();
  }}
/>
```

## How It Works

1. **Finds Failed Jobs**: Queries `campaign_send_queue` for items with `status = 'failed'` for the given campaign
2. **Optionally Filters**: If `lead_ids` are provided, only retries those specific leads
3. **Creates New Queue Items**: Inserts fresh rows with `status = 'queued'` instead of modifying existing failed rows
4. **Staggers Schedule**: Spreads `scheduled_at` across time to avoid sudden bursts
5. **Tracks Lineage**: Sets `retried_from` to point to the original failed item
6. **Logs Events**: Creates entries in `campaign_logs` for dashboard visibility

## Behavior Notes

- **Keeps Original Rows**: Failed rows remain in the database for audit purposes
- **Staggers Timing**: Prevents sudden bursts by spreading `scheduled_at` across time
- **Logs Activity**: Records re-queue events so dashboards update immediately
- **Optional Tracking**: If you skip the schema changes, the feature still works (some metadata tracking becomes a no-op)

## Environment Variables Required

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Limitations

- Default limit of 100 items per retry (configurable)
- No automatic retry count increment (requires additional RPC function if desired)
- Logging may fail silently if `campaign_logs` table structure differs

## Example Integration

```tsx
// In your campaign page
import RetryFailedButton from '@/components/queue/RetryFailedButton';
import useSWR from 'swr';

function CampaignDashboard({ campaignId }: { campaignId: string }) {
  const { data, mutate } = useSWR(`/api/campaigns/${campaignId}/queue`);
  
  return (
    <div>
      <h1>Campaign Queue</h1>
      <RetryFailedButton
        campaignId={campaignId}
        onDone={() => mutate()}
      />
      {/* ... rest of dashboard ... */}
    </div>
  );
}
```