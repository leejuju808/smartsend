# Trial Usage Tracking System

This document describes the implementation of a trial usage tracking system that limits free users based on usage metrics.

## Overview

The system tracks three key metrics for trial users:
- **Trial Replies Sent**: Number of AI-generated replies sent (limit: 3)
- **Trial Contacts Imported**: Number of contacts imported (limit: 50)  
- **Trial Extension Days**: Number of days the browser extension was used (limit: 1)

## Database Changes

### New Columns in `profiles` Table
```sql
alter table public.profiles
  add column if not exists trial_replies_sent int default 0,
  add column if not exists trial_contacts_imported int default 0,
  add column if not exists trial_extension_days int default 0;
```

### RPC Functions
```sql
-- Increment trial reply counter
create or replace function increment_trial_replies(uid uuid)
returns void language sql as $$
  update public.profiles
    set trial_replies_sent = trial_replies_sent + 1
  where id = uid;
$$;

-- Increment trial contacts counter
create or replace function increment_trial_contacts(uid uuid, n int)
returns void language sql as $$
  update public.profiles
    set trial_contacts_imported = trial_contacts_imported + n
  where id = uid;
$$;

-- Increment trial extension days counter
create or replace function increment_trial_extension(uid uuid)
returns void language sql as $$
  update public.profiles
    set trial_extension_days = trial_extension_days + 1
  where id = uid;
$$;
```

## API Endpoints

### `/api/gates/status`
Checks if a user has hit trial limits and returns `{ gated: boolean }`.

**Logic:**
- Pro users are never gated
- Trial users are gated if they exceed any limit:
  - `trial_replies_sent >= 3`
  - `trial_contacts_imported >= 50`
  - `trial_extension_days >= 1`

**Events Logged:**
- `upgrade_wall_shown` when user hits limits

### `/api/replies/send`
Increments `trial_replies_sent` counter for trial users after successful send.

### `/api/contacts/import`
Increments `trial_contacts_imported` counter for trial users after successful import.

### `/api/extension/status`
Increments `trial_extension_days` counter for trial users (once per day when extension is used).

## Frontend Components

### `UpgradeWall`
A modal component that appears when users hit trial limits.

**Features:**
- Automatically checks gate status on mount
- Shows upgrade CTA with billing link
- Logs `upgrade_wall_cta_clicked` event on CTA click
- "Maybe Later" button to dismiss temporarily

**Integration:**
- Added to dashboard layout root for overlay on all pages

## Event Tracking

The system logs key events for analytics:

1. **`upgrade_wall_shown`**: When user hits trial limits
2. **`upgrade_wall_cta_clicked`**: When user clicks upgrade CTA

## Usage Flow

1. **Trial User Sends 3rd Reply:**
   - Counter increments to 3
   - `/api/gates/status` returns `{ gated: true }`
   - `UpgradeWall` modal appears

2. **User Clicks Upgrade:**
   - Event logged: `upgrade_wall_cta_clicked`
   - Redirected to billing page

3. **User Upgrades to Pro:**
   - Webhook updates subscription status
   - Next API check returns `{ gated: false }`
   - Modal disappears

## Limits Configuration

Current trial limits are hardcoded in `/api/gates/status`:
```typescript
const limits = { replies: 3, contacts: 50, extDays: 1 };
```

To make these configurable, consider:
- Environment variables
- Database configuration table
- Admin panel settings

## Error Handling

All trial counter operations are wrapped in try-catch blocks to prevent failures from breaking core functionality. Errors are logged but don't affect user experience.

## Testing

Test scenarios:
1. Trial user sends 3rd reply → upgrade wall appears
2. Trial user imports 51st contact → upgrade wall appears  
3. Trial user uses extension on 2nd day → upgrade wall appears
4. Pro user usage → no limits applied
5. Upgrade flow → wall disappears after subscription change

## Future Enhancements

- Configurable limits per plan tier
- Grace period after hitting limits
- Usage analytics dashboard
- A/B testing different limit values
- Progressive feature gating 