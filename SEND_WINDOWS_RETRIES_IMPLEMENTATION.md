# Send Windows + Retries + Provider Adapters Implementation

## Overview

This implementation adds send windows with timezone support, automatic retries with exponential backoff, and provider adapters for Gmail and Outlook to the SmartSend AI email campaign system.

## Components Implemented

### 1. Database Migration

**File**: `supabase/migrations/20261102201000_send_windows_retries_providers.sql`

Adds:
- Campaign timezone and send window columns (`tz`, `send_window_start`, `send_window_end`)
- Queue retry metadata (`attempts`, `next_attempt_at`, `last_error_code`)
- Connected accounts OAuth columns (`scopes`, `provider_email`)
- Helper functions:
  - `in_send_window(p_campaign)` - Checks if current time is within send window
  - `next_window_start(p_campaign)` - Calculates next window start time
  - Updated `generate_send_queue()` to respect send windows

### 2. Provider Adapters

#### Shared Interface
**File**: `supabase/functions/_shared/providers.ts`

Defines:
- `SendResult` type
- `EmailProvider` interface
- `Mailbox` type
- `isExpiring()` utility function

#### Gmail Adapter
**File**: `supabase/functions/_shared/gmail.ts`

Features:
- Token refresh via Google OAuth API
- RFC822 base64url encoding
- Gmail API v1 integration
- Status code handling (401, 429, 5xx)

#### Outlook Adapter
**File**: `supabase/functions/_shared/outlook.ts`

Features:
- Token refresh via Microsoft Graph API
- JSON message format for Graph API
- Status code handling (401, 429, 5xx)

### 3. Backoff Utility

**File**: `supabase/functions/_shared/backoff.ts`

Exponential backoff: 1, 2, 4, 8, 16 minutes (capped at 6 hours)

### 4. Sender Tick Function

**File**: `supabase/functions/sender-tick/index.ts`

Features:
- Window-aware sending (checks `in_send_window()` before sending)
- Per-campaign window enforcement
- Provider adapter selection (Gmail/Outlook)
- Retry logic with exponential backoff
- Handles 401 (refresh), 429 (backoff), 5xx (backoff), 4xx (fail)
- Max 5 attempts per item
- Comprehensive error logging

### 5. UI Components

#### Send Window Component
**File**: `src/components/campaigns/SendWindow.tsx`

Features:
- Time range picker (start/end)
- Timezone selector (LA, NY, London, UTC)
- Save functionality
- Helpful description

### 6. API Endpoints

#### Campaign Window Settings
**File**: `src/app/api/campaigns/[id]/route.ts`

Added `PATCH` handler:
- Updates `tz`, `send_window_start`, `send_window_end`
- Checks user role (owner/editor)
- Returns success/error

## Usage

### Setting Send Windows

```typescript
import { SendWindow } from '@/components/campaigns/SendWindow'

<SendWindow campaignId={campaignId} />
```

### API Usage

```bash
# Update campaign send window
curl -X PATCH /api/campaigns/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "tz": "America/Los_Angeles",
    "send_window_start": "08:30",
    "send_window_end": "11:30"
  }'
```

## Environment Variables

Required for provider adapters:

```bash
GOOGLE_CLIENT_ID=<your_google_client_id>
GOOGLE_CLIENT_SECRET=<your_google_client_secret>
MS_CLIENT_ID=<your_microsoft_client_id>
MS_CLIENT_SECRET=<your_microsoft_client_secret>
CRON_SECRET=<secret_for_cron_auth>
```

## Deployment

### 1. Run Migration

```bash
# Apply migration
supabase db push

# Or apply manually in Supabase dashboard SQL editor
```

### 2. Deploy Edge Function

```bash
# Deploy sender-tick function
supabase functions deploy sender-tick

# Set environment variables in Supabase Dashboard
# Edge Functions → sender-tick → Settings → Secrets
```

### 3. Schedule Cron

Set up cron job to call `sender-tick` every minute:

```sql
-- In Supabase SQL editor
SELECT cron.schedule(
  'sender-tick',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/sender-tick',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
```

## Testing

### Window Behavior

1. Set window 08:30-11:30
2. Launch campaign at 7 PM
3. Verify `scheduled_at` & `next_attempt_at` jump to tomorrow 08:30
4. Confirm tick does not send until window

### Provider Sending

1. Connect Gmail/Outlook account
2. Queue test email
3. Verify real mail sent
4. Check token refresh handled

### Retry Logic

1. Force 429 via provider (or mock)
2. Verify status → 'queued', attempts increment
3. Verify `next_attempt_at` increases (1m, 2m, 4m...)
4. After 5 attempts → status 'failed'

## Architecture

```
Campaign (tz, send_window_start, send_window_end)
  ↓
Generate Queue (respects window, sets scheduled_at)
  ↓
Send Queue (attempts, next_attempt_at, last_error_code)
  ↓
Sender Tick (checks window, selects provider, handles retries)
  ↓
Gmail/Outlook Adapter (token refresh, send, status codes)
  ↓
Send Logs (audit trail)
```

## Notes

- Windows can cross midnight (e.g., 23:00-02:00)
- Backoff is exponential (1, 2, 4, 8, 16 minutes)
- Max 5 retry attempts per item
- Token refresh happens automatically when < 60s remaining
- RLS policies protect connected_accounts table
- Service role has full access for processing

