# Gmail Reply Detection Setup

This implementation adds a minimal Gmail reply detection system that polls Gmail accounts for new replies and updates the `emails_sent.replied` flag.

## Files Created

### SQL Migrations

1. **`supabase/migrations/20250102000000_emails_sent_replied.sql`**
   - Creates `emails_sent` table if it doesn't exist
   - Adds `replied` boolean column
   - Sets up RLS policies

2. **`supabase/migrations/20250102000001_email_logs.sql`**
   - Creates `email_logs` table for tracking reply detection events

3. **`supabase/migrations/20250102000002_gmail_accounts.sql`**
   - Creates/updates `gmail_accounts` table with OAuth tokens
   - Handles both new tables (user_id as PK) and existing tables (id as PK)
   - Sets up RLS policies

### Edge Function

**`supabase/functions/poll-gmail-replies/index.ts`**
- Polls each connected Gmail account for new inbound mail
- Matches replies by `thread_id`
- Updates `emails_sent.replied` flag
- Logs events to `email_logs`

### Frontend Utilities

1. **`src/lib/db.ts`**
   - `getInboxItems()` function to query `emails_sent` with `replied` filter

2. **`src/components/inbox/RepliedBadge.tsx`**
   - Component to display "Replied ✅" badge

3. **`src/app/api/inbox/emails-sent/route.ts`**
   - API endpoint example using `getInboxItems()`

## Setup Instructions

### 1. Run Migrations

```bash
# Migrations will run automatically on next deploy, or run manually:
supabase migration up
```

### 2. Deploy Edge Function

```bash
supabase functions deploy poll-gmail-replies --no-verify-jwt
```

### 3. Set Environment Variables

Add to your Supabase project settings:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

These should match your OAuth credentials.

### 4. Schedule the Function

Set up a cron job to run every 3 minutes:

**Via Supabase Dashboard:**
1. Go to Functions → Schedules
2. Create new schedule
3. Set pattern: `*/3 * * * *` (every 3 minutes)
4. Select function: `poll-gmail-replies`

**Via CLI (if supported):**
```bash
supabase functions schedule poll-gmail-replies --cron "*/3 * * * *"
```

### 5. Connect Gmail Account

Ensure your OAuth flow stores the `refresh_token` in the `gmail_accounts` table:

```sql
-- Example insert (done via your OAuth callback):
INSERT INTO public.gmail_accounts (user_id, email, refresh_token, access_token, token_expiry)
VALUES (
  'user-uuid',
  'user@gmail.com',
  'refresh-token-from-oauth',
  'access-token-from-oauth',
  NOW() + INTERVAL '1 hour'
)
ON CONFLICT (user_id) DO UPDATE
SET refresh_token = EXCLUDED.refresh_token,
    access_token = EXCLUDED.access_token,
    token_expiry = EXCLUDED.token_expiry;
```

## Usage

### Frontend: Query Inbox Items

```typescript
import { getInboxItems } from "@/lib/db";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabase = createClientComponentClient();
const { data } = await getInboxItems(supabase, {
  userId: user.id,
  filter: "unreplied", // or "replied" or "all"
});
```

### Frontend: Display Replied Badge

```tsx
import { RepliedBadge } from "@/components/inbox/RepliedBadge";

<RepliedBadge replied={email.replied} />
```

### Realtime Subscription (Optional)

Add to your inbox component for instant updates:

```typescript
useEffect(() => {
  const channel = supabase
    .channel('emails_realtime')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'emails_sent'
    }, (payload) => {
      // Update local state when replied flag changes
      setRows(prev => prev.map(row =>
        row.id === payload.new.id
          ? { ...row, replied: payload.new.replied }
          : row
      ));
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [supabase]);
```

## Testing

1. Connect a Gmail account (ensure `gmail_accounts` has `refresh_token`)
2. Send a campaign email to a test address you control
3. Reply from the test address
4. Wait ≤3 minutes → check `emails_sent.replied` flips to `true`
5. Verify the badge shows in your inbox UI

## How It Works

1. **Polling**: Edge function runs every 3 minutes
2. **Token Refresh**: Automatically refreshes access tokens if expired
3. **Query Gmail**: Searches for new inbound messages (not from me, in inbox, newer than 10m)
4. **Match Threads**: Finds `emails_sent` records with matching `thread_id`
5. **Update Flag**: Sets `replied = true` on matched emails
6. **Log Events**: Records detection events in `email_logs`

## Notes

- The function queries Gmail with `newer_than:10m` and relies on `last_checked` for precise filtering
- If a reply is detected, it only updates the first matching `emails_sent` record per thread
- Errors are logged to `email_logs` with type `reply_poller_error`
- The `gmail_accounts` migration handles both new schemas (user_id as PK) and existing schemas (id as PK)
