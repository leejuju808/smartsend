# Suppression System Implementation

This document outlines the unified suppression system implemented for SmartSend AI.

## Overview

The suppression system includes:
- Global per-user suppression list (email-level)
- Optional per-campaign suppression (fine-grained control)
- HMAC-signed unsubscribe links
- Auto-suppression from reply detection
- Suppression management UI

## Setup Instructions

### 1. Database Migration

Run the SQL migration to create the tables and policies:

```bash
# Via Supabase Dashboard
# Go to SQL Editor → paste contents of supabase/migrations/20250216_unified_suppression_system.sql → Run
```

Or apply via CLI:
```bash
supabase db push
```

This creates:
- `suppressions` table with RLS policies
- `campaign_suppressions` table with RLS policies
- `is_suppressed()` RPC function for efficient checking
- Necessary indexes for performance

### 2. Environment Variables

Add the following to your `.env.local` file:

```bash
SUPPRESSION_SECRET=super-long-random-string-64-chars-minimum
NEXT_PUBLIC_BASE_URL=https://app.smartsend.ai  # or http://localhost:3000 for dev
```

Generate a secure secret:
```bash
# Generate a strong secret
openssl rand -hex 32
```

### 3. Apply Environment Variables in Supabase

For the edge function, add the environment variable in Supabase dashboard:
1. Go to Project Settings → Edge Functions
2. Add `SUPPRESSION_SECRET` with your generated secret
3. Add `PUBLIC_BASE_URL` with your app URL

## Components

### 1. Database Tables

**`suppressions`** - Global per-user suppression list
- `user_id` - References auth.users
- `email` - Suppressed email address
- `reason` - "unsubscribe", "bounced", "manual", "complaint"
- `source` - "link", "reply", "import", "admin"
- Unique constraint on (user_id, email)

**`campaign_suppressions`** - Per-campaign suppression (optional)
- `user_id` - References auth.users
- `campaign_id` - References campaigns
- `email` - Suppressed email address
- `reason` - Optional reason
- Unique constraint on (campaign_id, email)

### 2. Token Utilities

**`src/lib/suppress/token.ts`**
- `signUnsub(payload)` - Creates HMAC-signed unsubscribe token
- `verifyUnsub(token)` - Verifies and decodes token
- Uses SHA-256 HMAC with base64url encoding

### 3. API Routes

**`src/app/api/unsub/route.ts`**
- GET handler for unsubscribe links
- Validates HMAC token
- Upserts into suppression tables
- Returns branded unsubscribe confirmation page

### 4. Edge Function Updates

**`supabase/functions/queue-dispatcher/index.ts`**
- Updated `isSuppressed()` to check both global and campaign suppressions
- Added `signUnsubToken()` for HMAC token generation
- Injects unsubscribe footer into all emails
- Skips suppressed emails before sending

### 5. Reply Auto-Suppression

**`src/app/api/inbound/reply/route.ts`**
- Detects unsubscribe intent from replies
- Automatically adds email to suppressions table
- Logs suppression for audit trail

### 6. Management UI

**`src/app/settings/suppressions/page.tsx`**
- View all suppressed emails
- Search by email, reason, or source
- Remove suppressions
- Shows timestamp and source of suppression

## Usage

### Adding Suppressions

Suppressions are automatically added when:
1. User clicks unsubscribe link in email
2. Reply contains unsubscribe intent
3. Manual addition via UI or API

### Checking Suppressions

The edge function automatically checks before sending:
```typescript
const suppressed = await isSuppressed(supabase, job.user_id, job.to_email, job.campaign_id);
```

### Unsubscribe Links in Emails

All emails automatically include unsubscribe links:
- Uses HMAC-signed tokens for security
- One-click unsubscribe
- Prevents unauthorized unsubscribes

### Suppression Management

Navigate to `/settings/suppressions` to:
- View all suppressed emails
- Search and filter
- Remove suppressions (re-subscribe)

## API Usage

### Manual Suppression (Service Role Only)

```typescript
await supabase.from("suppressions").upsert({
  user_id: userId,
  email: "user@example.com",
  reason: "bounced",
  source: "admin"
}, { onConflict: "user_id,email" });
```

### Check Suppression

```typescript
const { data } = await supabase.rpc("is_suppressed", {
  p_user_id: userId,
  p_email: email,
  p_campaign_id: campaignId
});
```

## Security Features

1. **HMAC-Signed Tokens**: Prevents token tampering
2. **User-Specific**: Each user can only manage their own suppressions
3. **RLS Policies**: Database-level security
4. **Service Role**: Only for system operations

## Bounce/Complaint Handling

To add bounce suppression:
```typescript
await supabase.from("suppressions").upsert({
  user_id: userId,
  email: bouncedEmail,
  reason: "bounced",
  source: "provider"
}, { onConflict: "user_id,email" });
```

## Testing

### Test Unsubscribe Link

1. Send a test email
2. Click the unsubscribe link
3. Verify email is added to suppressions table
4. Send another email to same address
5. Verify it's skipped

### Test Reply Suppression

1. Send an email
2. Reply with "unsubscribe"
3. Verify automatic suppression
4. Check suppression list in UI

## Troubleshooting

### Suppressions Not Working

1. Verify environment variables are set
2. Check RLS policies are applied
3. Verify `is_suppressed` RPC function exists
4. Check edge function logs

### Invalid Token Error

1. Verify `SUPPRESSION_SECRET` matches in both app and edge function
2. Check token hasn't expired (if expiry implemented)
3. Verify base64url encoding is correct

## Next Steps

1. Set up bounce handling webhook
2. Add complaint handling from providers
3. Implement suppression import/export
4. Add campaign-specific suppression UI
5. Add suppression analytics
