# Onboarding Implementation

This document describes the onboarding system that tracks user progress through key steps of the SmartSendAI platform.

## Overview

The onboarding system automatically tracks when users complete important actions:
- Import their first contacts
- Send their first campaign
- Upgrade to a paid plan

## API Endpoint

### POST `/api/onboarding/complete`

Marks an onboarding step as complete for the authenticated user.

**Request Body:**
```json
{
  "step": "import_contacts" | "send_campaign" | "upgrade"
}
```

**Response:**
```json
{
  "ok": true,
  "onboarding": {
    "import_contacts": true,
    "send_campaign": true,
    "upgrade": true
  }
}
```

## Database Schema

The onboarding progress is stored in the `profiles.onboarding` JSONB field:

```sql
-- Add onboarding column to profiles table
alter table public.profiles
  add column if not exists onboarding jsonb default '{}'::jsonb;

-- Create index for better performance on onboarding queries
create index if not exists idx_profiles_onboarding on public.profiles using gin (onboarding);
```

## Database Function

The system uses a PostgreSQL RPC function to merge onboarding steps:

```sql
create or replace function public.merge_onboarding_step(uid uuid, k text)
returns jsonb as $$
declare
  current jsonb;
begin
  select onboarding into current from public.profiles where id = uid;
  if current is null then
    current := '{}'::jsonb;
  end if;

  update public.profiles
    set onboarding = current || jsonb_build_object(k, true)
  where id = uid
  returning onboarding into current;

  return current;
end;
$$ language plpgsql security definer;
```

## Integration Points

### 1. Contact Import Success
When contacts are successfully imported via `/api/contacts/import`, the system automatically marks the `import_contacts` step as complete.

### 2. Campaign Send Success
When a campaign is sent via `/api/send-campaign` or when a scheduled campaign completes via the cron job, the system marks the `send_campaign` step as complete.

### 3. Upgrade Success
When a user subscribes via Stripe (webhook `customer.subscription.created`), the system marks the `upgrade` step as complete.

## Usage Examples

### Frontend Integration
```typescript
// Check onboarding progress
const { data: profile } = await supabase
  .from('profiles')
  .select('onboarding')
  .eq('id', userId)
  .single();

const onboarding = profile?.onboarding || {};
const hasImportedContacts = onboarding.import_contacts === true;
const hasSentCampaign = onboarding.send_campaign === true;
const hasUpgraded = onboarding.upgrade === true;
```

### Manual Step Completion
```typescript
// Mark a step as complete
await fetch('/api/onboarding/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ step: 'custom_step' })
});
```

## Testing

Run the onboarding tests:
```bash
npm test tests/onboarding.test.ts
```

## Future Enhancements

- Add more onboarding steps (e.g., first sequence, first template)
- Add onboarding progress percentage calculation
- Add onboarding completion rewards or badges
- Add onboarding step descriptions and help text 