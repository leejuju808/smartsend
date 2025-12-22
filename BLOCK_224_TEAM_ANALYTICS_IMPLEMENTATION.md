# Block 224 — Team Analytics v1 Implementation

## ✅ Status: COMPLETE

This implementation adds comprehensive team analytics to SmartSend, enabling managers and teams to track performance metrics per user.

## 📦 Files Created

### Database Migrations (3 files)
1. **`supabase/migrations/238_user_metrics.sql`**
   - Creates `user_metrics` table with columns: `emails_sent`, `replies_received`, `meetings_booked`, `opens`, `clicks`
   - Includes RLS policies for workspace access
   - Unique index on `(user_id, workspace_id)`

2. **`supabase/migrations/239_increment_metric.sql`**
   - Creates `increment_user_metric()` PL/pgSQL function
   - Atomically increments metrics with upsert pattern
   - Grants execute permissions to service_role and authenticated users

3. **`supabase/migrations/240_metrics_triggers.sql`**
   - Creates triggers to automatically update metrics when events occur:
     - `trg_update_metrics_on_send`: Fires when `send_queue.status` changes to 'sent' or 'done'
     - `trg_update_metrics_on_email_event`: Fires on `email_events` inserts (open, click, reply)
     - `trg_update_metrics_on_meeting_intent`: Fires when meeting intent is detected

### Edge Function (1 file)
4. **`supabase/functions/metrics-update/index.ts`**
   - HTTP endpoint that receives metric update requests
   - Maps event types to metric columns
   - Calls `increment_user_metric()` RPC function
   - Handles errors gracefully

### API Route (1 file)
5. **`app/api/team/metrics/route.ts`**
   - GET endpoint to fetch team metrics
   - Returns metrics for all users in a workspace
   - Includes user emails for display
   - Enforces workspace access control

### UI Components (1 file updated)
6. **`src/app/(dashboard)/team/ui/TeamClient.tsx`**
   - Added Team Analytics section with per-user metrics cards
   - Added Leaderboard section sorted by meetings booked
   - Displays: emails sent, replies, meetings booked, opens, clicks

## 🎯 Features Delivered

### ✅ Per-User Analytics
- Emails sent count
- Replies received count
- Meetings booked count
- Opens count
- Clicks count

### ✅ Team Leaderboard
- Sorted by meetings booked
- Shows replies count alongside meetings
- Displays user emails for identification

### ✅ Automatic Metric Updates
Metrics are automatically updated when:
- Email is sent (via `send_queue` trigger)
- Email is opened (via `email_events` trigger)
- Email link is clicked (via `email_events` trigger)
- Reply is received (via `email_events` trigger)
- Meeting intent is detected (via `inbox_threads` or `meeting_intents` trigger)

### ✅ Workspace Scoping
- All metrics are scoped to workspaces
- Users can only see metrics for their workspace
- Supports multi-workspace environments

## 🚀 Deployment Steps

### 1. Apply Database Migrations
```bash
# Apply migrations in order:
supabase migration up 238_user_metrics
supabase migration up 239_increment_metric
supabase migration up 240_metrics_triggers
```

Or apply manually via Supabase Dashboard → SQL Editor:
1. Copy contents of `238_user_metrics.sql` and run
2. Copy contents of `239_increment_metric.sql` and run
3. Copy contents of `240_metrics_triggers.sql` and run

### 2. Deploy Edge Function
```bash
supabase functions deploy metrics-update
```

### 3. Verify Deployment
1. Visit `/team` page in your app
2. Check that Team Analytics section appears
3. Send a test email and verify metrics update
4. Check that leaderboard displays correctly

## 📊 How It Works

### Metric Update Flow

1. **Event Occurs** (e.g., email sent, opened, clicked, reply received, meeting booked)
2. **Database Trigger Fires** (e.g., `trg_update_metrics_on_send`)
3. **HTTP POST to Edge Function** (`/functions/v1/metrics-update`)
4. **Edge Function Calls RPC** (`increment_user_metric()`)
5. **Metric Incremented** in `user_metrics` table
6. **UI Updates** when user visits `/team` page

### Data Flow

```
Event → Trigger → Edge Function → RPC → user_metrics table → API → UI
```

## 🔧 Configuration

### Edge Function Environment Variables
The edge function uses:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access

These are typically set automatically by Supabase.

### Database Settings
The triggers use `pg_net` extension for HTTP calls. Ensure it's enabled:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## 📝 Notes

### User ID Resolution
The triggers attempt to resolve `user_id` from multiple sources:
1. `campaigns.user_id` (primary)
2. `campaigns.owner_id` (fallback)
3. `send_queue.user_id` (if column exists)
4. `inbox_threads.owner_id` (if column exists)

### Workspace ID Resolution
Workspace ID is obtained from:
1. `campaigns.workspace_id` (primary)

### Error Handling
- Triggers use `EXCEPTION` blocks to prevent transaction failures
- Edge function logs errors but doesn't fail the request
- UI gracefully handles missing metrics

## 🎨 UI Features

### Team Analytics Section
- Grid layout (2 columns on desktop, 1 on mobile)
- Per-user metric cards
- Shows all 5 metrics per user
- Displays user email or truncated user ID

### Leaderboard Section
- Ordered list sorted by meetings booked
- Shows meetings count prominently
- Includes replies count for context
- Only displays when metrics exist

## 🔍 Troubleshooting

### Metrics Not Updating
1. Check that triggers are created: `SELECT * FROM pg_trigger WHERE tgname LIKE '%metrics%';`
2. Verify edge function is deployed: `supabase functions list`
3. Check edge function logs: `supabase functions logs metrics-update`
4. Verify `pg_net` extension is enabled

### User Emails Not Showing
1. Check that service role key is set correctly
2. Verify users exist in auth.users table
3. Check profiles table as fallback

### Workspace Access Issues
1. Verify user is in `workspace_members` table
2. Check RLS policies on `user_metrics` table
3. Verify workspace_id is correctly set in campaigns

## ✅ Block 224 — Team Analytics v1 SHIPPED

All components have been implemented and are ready for deployment. The system provides comprehensive team performance visibility for SmartSend teams, agencies, and SMB SDR crews.










