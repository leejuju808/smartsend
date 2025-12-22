# A/B Testing System Setup Guide

## Overview

This guide explains the new A/B testing system for email templates. The system allows users to:
1. Generate AI variants of their email templates
2. Configure experiment splits (e.g., 80/20, 50/50)
3. Track variant performance (sent, replies, reply rate)

## Database Schema

### Core Tables

#### `email_templates` (User Template Library)
Stores reusable email templates in a user's library:
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users)
- `name` (text) - Template name
- `subject` (text) - Email subject
- `body` (text) - Email body
- `created_at` (timestamptz)

#### `template_variants` (Variants)
Extends the existing template_variants table with:
- `source` (text) - 'manual' or 'ai'
- `label` (text) - e.g., "Control", "Variant A"
- All existing columns from legacy system

#### `campaign_experiments` (Experiment Setup)
Links a campaign to an experiment:
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users)
- `campaign_id` (uuid, FK -> campaigns)
- `template_id` (uuid, FK -> email_templates)
- `created_at` (timestamptz)

#### `experiment_allocations` (Split Configuration)
Defines how traffic is split across variants:
- `id` (uuid, PK)
- `experiment_id` (uuid, FK -> campaign_experiments)
- `variant_id` (uuid, FK -> template_variants)
- `pct` (integer) - Percentage allocation (1-100)
- Constraint: pct > 0 and pct <= 100

### Tracking Columns

Added to existing tables:
- `send_queue.variant_id` - References template_variants(id)
- `send_logs.variant_id` - References template_variants(id)

## Edge Functions

### `smart_rewrite`

**Location**: `supabase/functions/smart_rewrite/index.ts`

**Purpose**: Generates AI variants of email templates

**Input**:
```json
{
  "user_id": "uuid",
  "template_id": "uuid",
  "base_subject": "string",
  "base_body": "string",
  "variant_count": 2,  // optional, default 2
  "tone": "concise|friendly|direct|curious|authoritative",  // optional
  "constraints": {  // optional
    "max_words": 130,
    "keep_tokens": ["{{first_name}}", "{{company}}"]
  }
}
```

**Output**:
```json
{
  "ok": true,
  "variants": [
    {
      "id": "uuid",
      "label": "Variant A",
      "subject": "string",
      "body": "string"
    }
  ]
}
```

**Configuration**: Requires `OPENAI_API_KEY` in Supabase Function secrets

## RPC Functions

### `get_variant_reply_stats(c_id uuid)`

Returns performance metrics per variant for a campaign:
- `variant_id` (uuid)
- `sent_count` (int)
- `reply_count` (int)
- `reply_rate` (numeric)

## UI Components

### `VariantGenerator`

**Location**: `src/components/compose/VariantGenerator.tsx`

Generates AI variants of a template:
- Input: `templateId`, `baseSubject`, `baseBody`
- Controls: variant count (1-5), tone selector
- Output: Grid of generated variants

**Usage**:
```tsx
<VariantGenerator 
  templateId={templateId}
  baseSubject="Your subject"
  baseBody="Your body"
/>
```

### `ExperimentSplit`

**Location**: `src/components/compose/ExperimentSplit.tsx`

Configures traffic split across variants:
- Loads variants for a template
- Input fields for percentage allocation
- Validates total = 100%
- Saves to campaign_experiments + experiment_allocations

**Usage**:
```tsx
<ExperimentSplit 
  campaignId={campaignId}
  templateId={templateId}
/>
```

### `VariantStats`

**Location**: `src/components/compose/VariantStats.tsx`

Displays variant performance:
- Calls `get_variant_reply_stats` RPC
- Shows sent, replies, reply rate per variant
- Auto-refreshes based on campaignId

**Usage**:
```tsx
<VariantStats campaignId={campaignId} />
```

## Integration Steps

### 1. Database Migration

Run the migrations in order:
```bash
supabase db push
```

Or manually in Supabase SQL Editor:
1. `20250122000000_template_variants_experiments.sql`
2. `20250122000001_variant_stats_rpc.sql`
3. `20250122000002_template_variants_library.sql`

### 2. Deploy Edge Function

```bash
supabase functions deploy smart_rewrite --no-verify-jwt
```

### 3. Configure Environment

Set in Supabase Dashboard → Settings → Edge Functions → smart_rewrite:
- `OPENAI_API_KEY` - Your OpenAI API key

### 4. Update Composing Page

Add components to your compose page:

```tsx
import VariantGenerator from '@/components/compose/VariantGenerator'
import ExperimentSplit from '@/components/compose/ExperimentSplit'
import VariantStats from '@/components/compose/VariantStats'

export default function ComposePage({ params }: { params: { id: string } }) {
  const campaignId = params.id
  const templateId = "your-template-id" // fetch from state
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Compose & Experiment</h1>
      
      <VariantGenerator 
        templateId={templateId}
        baseSubject={subject}
        baseBody={body}
      />
      
      <ExperimentSplit 
        campaignId={campaignId}
        templateId={templateId}
      />
      
      <VariantStats campaignId={campaignId} />
    </div>
  )
}
```

### 5. Update Launch Logic (Future)

To actually assign variants based on experiment allocations, update your campaign launch logic:

```typescript
// In your launch action:
// 1. Check if campaign has experiment
const { data: exp } = await supabase
  .from('campaign_experiments')
  .select('id')
  .eq('campaign_id', campaignId)
  .single()

if (exp) {
  // 2. Fetch allocations
  const { data: allocs } = await supabase
    .from('experiment_allocations')
    .select('variant_id, pct')
    .eq('experiment_id', exp.id)

  // 3. Assign variant_id using weighted random
  function pickVariant(allocations: Array<{variant_id: string, pct: number}>) {
    const r = Math.random() * 100
    let sum = 0
    for (const a of allocations) {
      sum += a.pct
      if (r <= sum) return a.variant_id
    }
    return allocations[allocations.length - 1].variant_id
  }

  // 4. When creating send_queue rows:
  const variantId = pickVariant(allocs)
  rows.push({ ...leadData, variant_id: variantId })
}
```

### 6. Update Send Tick (Future)

Ensure variant_id is copied from queue to logs in your send worker:

```typescript
// In src/app/api/cron/tick/route.ts or equivalent
await supaSr.from("send_logs").insert({
  queue_id: job.id,
  campaign_id: job.campaign_id,
  lead_id: job.lead_id,
  variant_id: job.variant_id ?? null,  // Add this
  // ... other fields
})
```

## Testing

1. Create a test campaign
2. Generate AI variants using VariantGenerator
3. Configure split using ExperimentSplit
4. Launch campaign
5. Check VariantStats for performance

## Notes

- The system works alongside the existing `template_versions` system
- Use `variant_key` for legacy campaign-based variants
- Use `variant_id` for new user-library based variants
- Both systems can coexist in the same database

## Troubleshooting

**Variants not generating**:
- Check OpenAI API key is set in Supabase
- Verify edge function is deployed
- Check browser console for errors

**Stats not showing**:
- Ensure `variant_id` is being set in send_queue
- Verify `variant_id` is copied to send_logs
- Check RPC function exists in database

**Split validation failing**:
- Ensure percentages sum to exactly 100
- Check all variants have values

