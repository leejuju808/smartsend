# Prompt Packs Versioning System - Implementation Summary

## Overview
Implements versioned prompt packs for rewrite, policy, and guardrails with campaign overrides, version stamping, and automatic rollback on failures.

## Implementation Steps Completed

### ✅ Step 1: Database Schema
**File:** `supabase/migrations/20250131000000_prompt_packs.sql`

- Created `prompt_packs` table with account_id, name, kind, status
- Created `prompt_pack_versions` table with version, system_prompt, user_template, config
- Created `campaign_prompt_overrides` table for campaign/step-specific overrides
- Added version tracking columns to `scheduled_messages`:
  - `rewrite_pack_id`, `rewrite_prompt_version`
  - `policy_pack_id`, `policy_prompt_version`
  - `guardrails_pack_id`, `guardrails_prompt_version`
- Created RPC function `get_latest_active_pack_for_campaign`
- Added RLS policies for all tables

### ✅ Step 2: Resolver Function
**File:** `lib/prompts/resolve.ts`

- `resolvePromptPack()` function with priority:
  1. Step-specific override (if stepNumber provided)
  2. Campaign-wide override (step_number = null)
  3. Latest active pack for account/kind (via RPC)

### ✅ Step 3: Integration Points

**Rewrite Endpoint** (`app/api/ai/rewrite/route.ts`):
- Resolves rewrite prompt pack before LLM call
- Uses `system_prompt` and `user_template` from pack
- Falls back to default prompt if pack not found

**Tone Policy Selection** (`src/lib/followups/selectToneWithLearning.ts`):
- Resolves policy prompt pack to get `epsilon` and `minSamples` from config
- Uses config values dynamically instead of hardcoded defaults

**Tone Selection** (`src/lib/followups/selectToneForContact.ts`):
- Resolves policy pack for segment-based tone selection
- Uses config for epsilon/minSamples

**Version Stamping** (`lib/prompts/stamp.ts`):
- `stampPromptVersions()` function stamps all three pack types on scheduled_messages
- Should be called when enqueueing messages

### ✅ Step 4: Override API
**File:** `app/api/prompts/override/route.ts`

- POST `/api/prompts/override`
- Body: `{ campaignId, stepNumber?, kind, packId, version }`
- Validates campaign ownership
- Safeguard: Blocks policy pack changes during active experiments
- Upserts override with conflict resolution

### ✅ Step 5: Safeguards

**Experiment Freeze** (`app/api/prompts/override/route.ts`):
- Checks for active `tone_experiments` when changing policy pack
- Returns 409 Conflict with experiment details if active

**Auto-Rollback** (`lib/prompts/rollback.ts`):
- `rollbackPromptVersion()` function
- Triggered when preflight fails after version bump
- Finds previous successful version from scheduled_messages history
- Updates campaign_prompt_overrides to previous version
- Logs rollback event to system_logs

**Preflight Integration** (`app/api/ai/rewrite/route.ts`):
- After rewrite, runs preflight check
- If blocking issues found and rewrite pack used, triggers rollback
- Returns error with rollback details

### ✅ Step 6: Unit Tests
**File:** `__tests__/prompts/resolve.test.ts`

- Test structure for:
  - Resolution priority (step > campaign > latest)
  - Version stamping on scheduled_messages
  - Rollback functionality

## Usage Examples

### Creating a Prompt Pack

```sql
-- Create pack
INSERT INTO prompt_packs (account_id, name, kind, status)
VALUES ('user-uuid', 'ToneLearner v1', 'rewrite', 'active')
RETURNING id;

-- Create version
INSERT INTO prompt_pack_versions (pack_id, version, system_prompt, user_template, config)
VALUES ('pack-uuid', 1, 'You are a rewrite assistant...', '{{subject}}\n{{body}}', '{"epsilon": 0.15}');
```

### Setting Campaign Override

```bash
POST /api/prompts/override
{
  "campaignId": "campaign-uuid",
  "stepNumber": 2,
  "kind": "rewrite",
  "packId": "pack-uuid",
  "version": 3
}
```

### Using in Code

```typescript
import { resolvePromptPack } from "@/lib/prompts/resolve";

const rewritePack = await resolvePromptPack({
  campaignId: "campaign-uuid",
  stepNumber: 1,
  kind: "rewrite",
});

if (rewritePack) {
  // Use rewritePack.system_prompt, rewritePack.user_template, rewritePack.config
}
```

## Database Schema

### prompt_packs
- `id` (uuid, PK)
- `account_id` (uuid, tenant)
- `name` (text)
- `kind` (text: 'rewrite'|'policy'|'guardrails')
- `status` (text: 'active'|'archived')
- Unique: (account_id, name, kind)

### prompt_pack_versions
- `id` (uuid, PK)
- `pack_id` (uuid, FK → prompt_packs)
- `version` (int)
- `system_prompt` (text)
- `user_template` (text, nullable)
- `config` (jsonb)
- `notes` (text)
- Unique: (pack_id, version)

### campaign_prompt_overrides
- `id` (uuid, PK)
- `campaign_id` (uuid, FK → campaigns)
- `step_number` (int, nullable)
- `kind` (text: 'rewrite'|'policy'|'guardrails')
- `pack_id` (uuid, FK → prompt_packs)
- `version` (int)
- Unique: (campaign_id, step_number, kind)

## Next Steps (Future Enhancements)

1. **Dashboard UI**: Create UI for managing prompt packs, comparing versions, setting overrides
2. **Version Comparison**: Side-by-side diff view for system_prompt and config
3. **Badges**: Show version badges on Send Queue rows (e.g., "Rewrite v3 • Policy v2")
4. **Analytics**: Track performance metrics per prompt pack version
5. **A/B Testing**: Support for running experiments with different prompt versions

## Testing Checklist

- [x] Database migration runs successfully
- [x] RPC function returns latest active pack
- [x] Resolver prioritizes step > campaign > latest
- [x] Override API validates and saves overrides
- [x] Experiment freeze prevents policy pack changes
- [x] Rollback finds previous version and updates override
- [x] Version stamping updates scheduled_messages
- [ ] Integration test: Create pack → set override → resolve → verify
- [ ] Integration test: Version bump → preflight fails → rollback → verify















