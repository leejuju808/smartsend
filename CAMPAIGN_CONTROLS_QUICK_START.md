# Campaign Controls - Quick Start

## 🚀 5-Minute Setup

### Step 1: Apply Database Migrations (2 min)

Run these SQL migrations in order in Supabase Dashboard → SQL Editor:

```sql
-- Migration 1: Add campaign status and queue controls
-- File: supabase/migrations/20260121000000_campaign_controls_and_queue_priority.sql
```

```sql
-- Migration 2: Update claim_due_queue for pause/cancel/priority
-- File: supabase/migrations/20260121000001_update_claim_function_with_controls.sql
```

```sql
-- Migration 3: Update claim_send_jobs for pause/cancel/priority  
-- File: supabase/migrations/20260121000002_update_claim_send_jobs_with_controls.sql
```

### Step 2: Deploy Code (1 min)

```bash
npm run build
npm run deploy
```

### Step 3: Add Controls to UI (2 min)

In your campaign page (e.g., `src/app/(dashboard)/campaigns/[id]/dashboard.tsx`):

```typescript
import { ControlsBar } from './controls/ControlsBar';

export default function CampaignDashboard({ id }: { id: string }) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1>Campaign Dashboard</h1>
        <ControlsBar campaignId={id} /> {/* Add this */}
      </div>
      {/* rest of your UI */}
    </div>
  );
}
```

## ✅ Done!

You now have:
- ✅ Pause/Resume campaign controls
- ✅ Cancel queued items
- ✅ Priority boosting (0-100)
- ✅ Launch guards for paused campaigns

## 🧪 Quick Test

1. Launch a campaign
2. Click **Pause** → new sends stop
3. Click **Resume** → campaign continues
4. Click **Cancel Queued** → queued items won't send

## 📚 Next Steps

See `CAMPAIGN_CONTROLS_IMPLEMENTATION.md` for:
- Full API documentation
- Advanced usage examples
- Security & guardrails
- Performance considerations

