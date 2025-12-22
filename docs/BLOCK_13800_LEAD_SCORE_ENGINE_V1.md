# Block 13800 — SmartSend Lead Score Engine v1

**The Automatic HOT/WARM/COLD Scoring System That Shows Roofers EXACTLY Who to Focus On**

## Overview

The Lead Score Engine automatically scores every homeowner contact based on behaviors, replies, intent, interest level, job size, storm/insurance signals, urgency indicators, engagement, historical data, and enrichment data.

## Lead Score Scale

- **0–20 = COLD** 🔵
  - No reply
  - Low engagement
  - Suspicious email
  - Low potential job size

- **21–60 = WARM** 🟡
  - Replied, but not urgent
  - General interest
  - Needs follow-up
  - Repair-level job

- **61–100 = HOT** 🔥
  - High interest
  - Strong reply indicators
  - Insurance involved
  - Asking questions
  - Price-checking
  - Needs inspection ASAP

**HOT = book estimate NOW**

## Scoring Drivers

### 1️⃣ Reply Signals (+25 to +75)
- "Yes" → +70
- "What's the price?" → +55
- "Can you come this week?" → +80 (auto-HOT)
- "Is this covered by insurance?" → +65
- General reply → +25

### 2️⃣ Intent Classifier (Block 8340)
- HOT → +80
- WARM → +50
- FOLLOW-UP → +35
- NOT_INTERESTED → -20
- OUT_OF_SCOPE → -40

### 3️⃣ Storm Risk (+20 to +40)
- Hail zone → +30
- Windstorm → +20
- Recent heavy rain → +15

### 4️⃣ Insurance Indicators (+30 to +60)
Keywords: adjuster, claim, inspection, payout

### 5️⃣ Repair Signals (+20 to +50)
Mentions: leaks, missing shingles, flashing, vents, skylights

### 6️⃣ Replacement Signals (+40 to +70)
Keywords: full roof, replacement, shingles worn, roof is old

### 7️⃣ Past Quote History (+30)
If enrichment finds old quote → +30

### 8️⃣ Engagement Behavior (+10 to +30)
- Multiple opens → +10
- Consistent engagement → +15
- Clicked link → +30

### 9️⃣ High-Value Home Indicators (+20 to +40)
- Large home
- Premium zip
- Multi-property owner

### 🔟 Low Quality Signals (-30 to -80)
- Spammy/invalid → -80
- Auto-responder/disposable → -50
- Commercial/wrong person → -40
- Bounced → -60

## Database Schema

### Contacts Table
- `lead_score` (integer, 0-100)
- `lead_score_last_updated` (timestamptz)

### lead_score_events Table
Logs every score change:
- `contact_id`
- `old_score`
- `new_score`
- `delta`
- `reason`
- `event_id`
- `metadata`
- `created_at`

## Functions

### `calculate_lead_score(contact_id, messages, tags, enrichment, engagement)`
Calculates score based on all factors.

### `update_contact_lead_score(contact_id, reason, event_id, metadata)`
Updates contact score and logs event.

### `recalculate_workspace_lead_scores(workspace_id, limit)`
Bulk recalculation for nightly jobs.

## Auto-Update Triggers

Scores update automatically when:
- ✅ Reply received (inbox_messages INSERT)
- ✅ Intent classified (inbox_messages UPDATE)
- ✅ Enrichment updated (contact_enrichment INSERT/UPDATE)
- ✅ Tags updated (contacts UPDATE)

## API Endpoints

### GET `/api/contacts/[id]/lead-score`
Get contact lead score and events.

### POST `/api/contacts/[id]/lead-score`
Recalculate contact lead score.

### POST `/api/contacts/lead-score/recalculate`
Bulk recalculate scores for workspace or specific contacts.

## TypeScript Helpers

```typescript
import {
  updateContactLeadScore,
  recalculateContactLeadScore,
  getLeadScoreCategory,
  formatLeadScore,
  getContactsByScore,
  getLeadScoreStats,
} from "@/lib/lead-scoring/contact-lead-score";
```

## UI Components

```tsx
import { LeadScoreBadge } from "@/components/contacts/LeadScoreBadge";

<LeadScoreBadge score={contact.lead_score} />
```

## Worker Function

`supabase/functions/recalculate-lead-scores/index.ts`

Call via cron or manually:
```bash
supabase functions invoke recalculate-lead-scores \
  --body '{"workspace_id": "xxx", "limit": 100}'
```

## Usage Examples

### Sort contacts by score
```typescript
const hotLeads = await getContactsByScore(supabase, workspaceId, {
  category: "HOT",
  limit: 50,
});
```

### Get score statistics
```typescript
const stats = await getLeadScoreStats(supabase, workspaceId);
// { total: 1000, hot: 45, warm: 230, cold: 725, average: 28.5 }
```

### Manually recalculate score
```typescript
await recalculateContactLeadScore(supabase, contactId, "manual_recalculation");
```

## Why Roofers Will Love This

1. **They instantly know who to call** - No more guessing
2. **HOT leads = more booked estimates** - Direct revenue impact
3. **Higher closing rates** - Call HOT leads immediately
4. **Turns SmartSend into a "sales system"** - Revenue intelligence
5. **Premium feel** - Contractors aren't used to smart scoring systems

## Implementation Status

✅ Database migration
✅ Scoring function with all 10 drivers
✅ Auto-update triggers
✅ TypeScript helpers
✅ API endpoints
✅ Worker function for nightly recalculation
✅ UI badge component

## Next Steps

1. Add lead score column to contacts table UI
2. Add sorting/filtering by score
3. Add dashboard metrics widget
4. Add inbox highlighting for HOT leads
5. Set up nightly cron job for recalculation





















































