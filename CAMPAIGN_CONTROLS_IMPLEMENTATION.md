# Campaign Controls & Queue Priority Implementation

This implementation adds comprehensive campaign control features including pause/resume, cancel queued items, and priority boosting.

## 🎯 Features Implemented

### 1. Database Upgrades
- **Campaign Status**: `draft | active | paused | completed | archived`
- **Queue Controls**: `priority`, `canceled_at`, `canceled_by`
- **Performance Indexes**: Optimized queries for live queue and campaign status

### 2. Queue Processing
- **Paused Campaigns**: Automatically excluded from queue processing
- **Canceled Items**: Respects `canceled_at` timestamp
- **Priority Ordering**: Higher priority items send first (0-100 scale)

### 3. Campaign Controls
- **Pause**: Stops all new sends without canceling queued items
- **Resume**: Re-enables campaign sending
- **Cancel Queued**: Marks all queued items as canceled
- **Boost Priority**: Adjust individual item priority (0-100)

### 4. Launch Guards
- **Paused Check**: Blocks launching new sends when campaign is paused
- **Auto-Resume Option**: Can be enabled to automatically resume on launch

## 📁 Files Created/Modified

### Database Migrations
1. `supabase/migrations/20260121000000_campaign_controls_and_queue_priority.sql`
   - Adds status column to campaigns
   - Adds priority, canceled_at, canceled_by to send_queue
   - Creates performance indexes

2. `supabase/migrations/20260121000001_update_claim_function_with_controls.sql`
   - Updates `claim_due_queue` to respect pause/cancel/priority
   - Increments attempts counter on claim

3. `supabase/migrations/20260121000002_update_claim_send_jobs_with_controls.sql`
   - Updates `claim_send_jobs` to respect pause/cancel/priority
   - Priority-aware ordering for per-user parallel processing

### Server Actions
5. `src/app/(dashboard)/campaigns/[id]/controls/actions.ts`
   - `pauseCampaign()`: Set campaign to paused
   - `resumeCampaign()`: Set campaign to active
   - `cancelQueued()`: Cancel all queued items
   - `boostPriority()`: Set individual item priority

### UI Components
6. `src/app/(dashboard)/campaigns/[id]/controls/ControlsBar.tsx`
   - Pause/Resume/Cancel buttons
   - Status feedback

7. `src/app/(dashboard)/campaigns/[id]/controls/PriorityCell.tsx`
   - Inline priority editor (0-100)
   - Boost button

### Launch Guards
8. `src/app/(dashboard)/campaigns/[id]/launch/actions.ts` (modified)
   - Added paused campaign check

## 📋 Summary

Total files created/modified: **8 files**
- 3 database migrations
- 1 server actions file
- 2 UI components
- 1 modified launch action
- 1 documentation file

## 🚀 Deployment Steps

### 1. Apply Database Migrations
```bash
# In Supabase Dashboard → SQL Editor, run (in order):
supabase/migrations/20260121000000_campaign_controls_and_queue_priority.sql
supabase/migrations/20260121000001_update_claim_function_with_controls.sql
supabase/migrations/20260121000002_update_claim_send_jobs_with_controls.sql
```

### 2. Deploy Code
```bash
# Deploy Next.js app
npm run build
npm run deploy
```

### 3. Update Edge Function (if needed)
The edge function `supabase/functions/send-queue/index.ts` already uses the RPC `claim_due_queue`, so no changes needed.

## 🧪 Testing Plan

### 1. Basic Pause/Resume
```bash
# Launch a campaign → confirm queued items visible
# Click Pause → new sends stop (edge function no longer claims rows)
# Click Resume → campaign resumes sending
```

### 2. Priority Boost
```bash
# Launch a campaign with multiple queued items
# Boost priority on one queued item
# Click Resume → that item sends first
```

### 3. Cancel Queued
```bash
# Launch a campaign
# Click Cancel Queued → queued rows get canceled_at
# Confirm these items won't be claimed
```

### 4. Launch Guards
```bash
# Pause a campaign
# Try to launch → you get a friendly error
```

### 5. Integration
```bash
# Test with multiple campaigns
# Verify RLS permissions work correctly
# Check index performance with large datasets
```

## 🔒 Security & Guardrails

### RLS Enforcement
- All controls respect existing RLS policies
- Only `canSend` permission can pause/resume/cancel
- Priority boost requires campaign role check

### Data Integrity
- `canceled_at` prevents accidental re-processing
- Campaign status checked at queue claim time
- Priority capped at 0-100

### Edge Safety
- Queue processor filters paused campaigns
- Canceled items never processed
- Priority ordering deterministic

## 📊 Usage Examples

### Pause a Campaign
```typescript
import { pauseCampaign } from '@/app/(dashboard)/campaigns/[id]/controls/actions';

await pauseCampaign(campaignId);
```

### Boost Priority
```typescript
import { boostPriority } from '@/app/(dashboard)/campaigns/[id]/controls/actions';

const formData = new FormData();
formData.append('queueId', queueId);
formData.append('priority', '75');
await boostPriority(null, formData);
```

### UI Integration
```typescript
import { ControlsBar } from '@/app/(dashboard)/campaigns/[id]/controls/ControlsBar';

// In your campaign page
<ControlsBar campaignId={campaignId} />
```

## 🎨 UI Integration Points

### Add ControlsBar to Campaign Page
In `src/app/(dashboard)/campaigns/[id]/dashboard.tsx`:

```typescript
import { ControlsBar } from './controls/ControlsBar';

// Add after the title
<ControlsBar campaignId={id} />
```

### Add PriorityCell to Queue Table
In your queue display component:

```typescript
import { PriorityCell } from '../controls/PriorityCell';

// In table row
<td>
  <PriorityCell id={item.id} current={item.priority} />
</td>
```

## 📈 Performance Considerations

- **Indexes**: New composite indexes optimize queue queries
- **Priority Sorting**: O(n log n) but limits `max_rows`
- **RLS Overhead**: Minimal due to indexed lookups

## 🔄 Future Enhancements

1. **Auto-resume on Launch**: Toggle to automatically resume paused campaigns
2. **Bulk Priority**: Set priority for multiple items at once
3. **Priority Templates**: Preset priority levels (urgent, normal, low)
4. **Schedule Pause**: Automatically pause/resume on schedule
5. **Rate Limiting**: Prevent priority abuse with minute-level rate limits

## 📝 Notes

- Existing `send_queue` items get default priority=0
- Campaign status defaults to 'draft' for new campaigns
- Launch action automatically sets status to 'active'
- RLS policies handle multi-user/team scenarios automatically

