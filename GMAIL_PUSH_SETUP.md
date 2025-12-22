# Gmail Push Notifications - Implementation Summary

This implementation adds Gmail push notifications to your SmartSend AI app, automatically detecting replies without polling.

## Files Created/Modified

### 1. Database Migration
**File**: `supabase/migrations/20251026_integrations_gmail.sql`
- Creates `integrations_gmail` table to store OAuth tokens and watch state
- Stores `access_token`, `refresh_token`, `last_history_id`, and `watch_expiration`

### 2. Google OAuth Helper
**File**: `src/lib/google.ts`
- `getOAuthClient()`: Initializes OAuth client for a workspace
- `gmail()`: Returns Gmail API client
- Auto-refreshes tokens and persists to database

### 3. Watch Endpoint
**File**: `src/app/api/gmail/watch/route.ts`
- `POST /api/gmail/watch`
- Registers Gmail watch subscription
- Updates `last_history_id` and `watch_expiration`

### 4. Push Handler
**File**: `src/app/api/gmail/push/route.ts`
- `POST /api/gmail/push`
- Receives Pub/Sub notifications from Gmail
- Fetches new messages via history.list
- Pipes to `/supabase/functions/v1/reply-webhook`

## Required Environment Variables

Add these to your `.env.local`:

```env
# Google OAuth (you should already have these)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourapp.com/api/oauth/google/callback

# Gmail Push/Sub
GMAIL_PUBSUB_TOPIC=projects/your-proj/topics/smartsend-gmail
PUBSUB_VERIFICATION_TOKEN=your-random-verification-token
NEXT_PUBLIC_BASE_URL=https://yourapp.com
```

## Setup Steps

### 1. Run Migration
```bash
pnpm run db:migrate
# or manually apply supabase/migrations/20251026_integrations_gmail.sql
```

### 2. Store Gmail OAuth Tokens
When a user connects Gmail, save their OAuth tokens to `integrations_gmail`:

```typescript
await supabaseAdmin.from('integrations_gmail').insert({
  workspace_id: workspaceId,
  email: userEmail,
  access_token: token.access_token,
  refresh_token: token.refresh_token,
  expiry_date: new Date(Date.now() + token.expires_in * 1000).toISOString()
});
```

### 3. Create Pub/Sub Topic in GCP
```bash
gcloud pubsub topics create smartsend-gmail
```

### 4. Create Push Subscription
In GCP Console or CLI:
- Topic: `smartsend-gmail`
- Push endpoint: `https://yourapp.com/api/gmail/push`
- Add header: `x-pubsub-token: your-verification-token`

### 5. Grant Gmail Service Account Access
Grant the Gmail service account publisher role on your topic:
```bash
gcloud pubsub topics add-iam-policy-binding smartsend-gmail \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

### 6. Start Watch for a Workspace
```bash
curl -X POST https://yourapp.com/api/gmail/watch \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "your-workspace-id"}'
```

## How It Works

1. **Initial Setup**: User connects Gmail → tokens saved to `integrations_gmail`
2. **Watch Started**: `/api/gmail/watch` creates a Pub/Sub subscription
3. **New Email Arrives**: Gmail sends push notification to Pub/Sub
4. **Push Handler**: `/api/gmail/push` receives notification
5. **Fetch Messages**: Uses `history.list` to get new messages since `last_history_id`
6. **Pipe to Webhook**: Calls Supabase Edge Function `/functions/v1/reply-webhook`
7. **Update Status**: Lead is marked as "Replied" in your dashboard

## Notes

- Gmail watch subscriptions expire periodically (typically every 7 days)
- Re-run `/api/gmail/watch` when `watch_expiration` is near
- The system auto-refreshes OAuth tokens when they expire
- Only processes INBOX messages (can be customized in watch endpoint)

## Testing

To test locally, you can use Google's Pub/Sub emulator or manually trigger:

```bash
curl -X POST http://localhost:3000/api/gmail/push \
  -H "Content-Type: application/json" \
  -H "x-pubsub-token: your-token" \
  -d '{
    "message": {
      "data": "base64-encoded-gmail-push-data"
    }
  }'
```