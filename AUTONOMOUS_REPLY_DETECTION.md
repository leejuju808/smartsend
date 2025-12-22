# Autonomous Reply Detection System

## Overview

SmartSend's autonomous reply detection system completes the "send → detect → track" loop. This system automatically detects when leads reply to outbound emails and marks them as "Replied" in Supabase without any manual intervention.

## Key Features

- ✅ **Autonomous Detection**: Automatically polls Gmail inbox every 5 minutes
- ✅ **Email Matching**: Matches inbound email sender with SmartSend's leads
- ✅ **Database Updates**: Automatically updates `email_logs` and `campaign_leads` tables
- ✅ **AI Badge**: UI displays ⚡ badge for auto-detected replies
- ✅ **Real-time Updates**: Realtime subscriptions for instant UI updates

## Implementation Summary

### 1. Database Schema Updates

**New Migration: `20250110000000_add_reply_detected_to_email_logs.sql`**
- Added `reply_detected` boolean column to `email_logs` table
- Added index for efficient querying of detected replies
- Default value: `false`

**New Migration: `20250110000001_add_auto_detected_to_campaign_leads.sql`**
- Added `auto_detected` boolean column to `campaign_leads` table
- Added index for efficient querying
- Default value: `false`

### 2. Edge Function: `detect-replies`

**Location**: `supabase/functions/detect-replies/index.ts`

**Key Features**:
- Fetches all active Gmail connections from database
- Handles OAuth token refresh automatically
- Polls Gmail inbox for recent messages (last 24 hours)
- Matches sender email with SmartSend leads
- Updates both `email_logs` and `campaign_leads` tables
- Marks Gmail messages as read after processing

**Core Logic**:
```typescript
// Fetch recent messages from Gmail
const query = `in:inbox after:${Math.floor((Date.now() - 86400000) / 1000)} -category:promotions -category:social`;

// Match sender with leads
const matchedLead = leadsMap.get(fromEmail);

// Update email_logs
await supabase
  .from("email_logs")
  .update({
    reply_detected: true,
    replied_at: new Date().toISOString(),
  })
  .eq("lead_id", matchedLead.id)
  .eq("reply_detected", false);

// Update campaign_leads
await supabase
  .from("campaign_leads")
  .update({
    has_replied: true,
    replied_at: new Date().toISOString(),
    auto_detected: true,
    reply_state: 'confirmed',
  })
  .eq("lead_id", matchedLead.id)
  .eq("has_replied", false);
```

### 3. Scheduled Execution

**Cron Configuration**: `supabase/config.toml`
```toml
[functions.detect-replies]
verify_jwt = false

[cron.jobs.detect-replies]
schedule = "*/5 * * * *"   # Check for replies every 5 minutes
endpoint = "/functions/v1/detect-replies"
```

**Migration**: `20250110000002_detect_replies_cron.sql`
- Creates pg_cron job to run every 5 minutes
- Uses pg_net extension for HTTP calls
- Auto-refreshes authentication tokens

### 4. UI Updates

**Enhanced Badge Component**: `src/components/replies-inbox/LeadStatusBadge.tsx`
- Added `autoDetected` prop
- Displays ⚡ lightning icon for auto-detected replies
- Tooltip: "Auto-detected by AI"

**Updated Inbox Page**: `src/app/replies-inbox/page.tsx`
- Queries `auto_detected` field from `campaign_leads`
- Passes field to badge component
- Real-time updates via Supabase subscriptions

## Data Flow

1. **Send Email** → Email sent via SmartSend → `email_logs` record created
2. **Lead Replies** → Lead sends reply to Gmail inbox
3. **Cron Triggers** → Every 5 minutes, `detect-replies` function runs
4. **Gmail Polling** → Fetches recent messages from Gmail API
5. **Email Matching** → Matches sender email with leads in database
6. **Database Updates** → Updates both `email_logs` and `campaign_leads`
7. **UI Updates** → Realtime subscription updates Replies Inbox
8. **Badge Display** → Shows ⚡ badge for auto-detected replies

## Deployment Instructions

### 1. Apply Migrations
```bash
supabase migration up
```

### 2. Deploy Edge Function
```bash
supabase functions deploy detect-replies
```

### 3. Verify Cron Configuration
The cron job is automatically configured in `supabase/config.toml`. Verify it's scheduled:
```bash
supabase functions list
```

### 4. Test the Function
Trigger manually for testing:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/detect-replies \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

## Environment Variables Required

- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

## Future Enhancements

1. **AI Classification**: Expand to classify reply sentiment (positive/neutral/negative)
2. **Auto-Stop Sequences**: Automatically pause email sequences when lead replies
3. **CRM Integration**: Auto-add replied leads to external CRM (OpsGrid)
4. **Thread Matching**: Use Gmail thread IDs for more accurate matching
5. **Outlook Support**: Add similar detection for Outlook/microsoft accounts
6. **Webhook Support**: Accept webhook notifications from Gmail Push API

## Monitoring

Check function execution logs:
```bash
supabase functions logs detect-replies
```

Query detected replies:
```sql
SELECT COUNT(*) FROM email_logs WHERE reply_detected = true;
SELECT COUNT(*) FROM campaign_leads WHERE auto_detected = true;
```

## Support

For issues or questions:
1. Check edge function logs in Supabase dashboard
2. Verify Gmail OAuth tokens are valid
3. Confirm cron job is scheduled correctly
4. Test manual function invocation

## Success Criteria

✅ System automatically detects replies every 5 minutes
✅ Gmail inbox is polled for recent messages
✅ Leads are matched by email address
✅ Both `email_logs` and `campaign_leads` are updated
✅ UI displays auto-detected badge (⚡)
✅ No manual intervention required
✅ Real-time UI updates work

---

**Status**: ✅ Complete and ready for deployment

