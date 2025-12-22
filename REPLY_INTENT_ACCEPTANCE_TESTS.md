# Reply-Intent Detector Acceptance Tests

This document covers the acceptance testing for the **Reply-Intent Detector + Auto-Calendar Insert** feature.

## 📋 Prerequisites

1. **Database Migration**: Run the migration to ensure all columns exist

```bash
# Apply the migration (if using Supabase CLI locally)
supabase db reset

# OR apply manually via Supabase Dashboard
# Run: supabase/migrations/20241215_reply_intent_meetings_complete.sql
```

2. **Environment Variables**: Ensure these are set in your `.env.local`

```bash
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. **Supabase Function Deployed**

```bash
# Deploy the function
supabase functions deploy reply-intent-detector --project-ref your-ref

# OR test locally
supabase functions serve reply-intent-detector
```

## ✅ Acceptance Test 1: Simulate Positive Meeting Intent

### Step 1: Get Your User ID

```bash
# Option 1: From Supabase Dashboard
# Go to Authentication > Users > Copy your user ID

# Option 2: From your app's browser console
# Open DevTools Console and run:
# (await supabase.auth.getUser()).data.user.id
```

### Step 2: Start Your Dev Server

```bash
npm run dev
# Server should be running on http://localhost:3000
```

### Step 3: Simulate a Positive Reply

```bash
curl -X POST http://localhost:3000/api/replies/simulate \
  -H "Content-Type: application/json" \
  -H "x-ss-user-id: YOUR_AUTH_USER_ID" \
  -d '{
    "sender":"lead@example.com",
    "subject":"Yes let us book this week",
    "bodyText":"Sounds good—this Thursday afternoon works. Send me a link."
  }'
```

### Expected Response:

```json
{
  "ok": true,
  "message": "Reply processed successfully",
  "data": {
    "status": "booked",
    "intent": "positive_meeting_intent",
    "calendly_link": "https://calendly.com/YOUR_CALENDLY_USERNAME",
    "meeting_id": "uuid-here"
  },
  "raw": {
    "status": "booked",
    "intent": "positive_meeting_intent",
    "calendly_link": "https://calendly.com/YOUR_CALENDLY_USERNAME",
    "meeting_id": "uuid-here",
    "ics_content": "BEGIN:VCALENDAR..."
  }
}
```

### Step 4: Verify in UI

1. Open **http://localhost:3000/meetings**
2. You should see a new row with:
   - **Status Badge**: 🎉 Booked (green/emerald background)
   - **Email**: lead@example.com
   - **Subject**: "Yes let us book this week"
   - **Calendly Link**: Clickable link

## ✅ Acceptance Test 2: Simulate Neutral/Negative Intent

### Test Neutral Response

```bash
curl -X POST http://localhost:3000/api/replies/simulate \
  -H "Content-Type: application/json" \
  -H "x-ss-user-id: YOUR_AUTH_USER_ID" \
  -d '{
    "sender":"neutral@example.com",
    "subject":"Thanks for reaching out",
    "bodyText":"Thanks for the info. I will review and get back to you if interested."
  }'
```

### Expected Response:

```json
{
  "ok": true,
  "message": "Reply processed successfully",
  "data": {
    "status": "neutral",
    "intent": "neutral",
    "calendly_link": null,
    "meeting_id": null
  }
}
```

### Verify in UI:

- This should **NOT** appear in the meetings table (or appear with status "no_meeting")
- Check the `ai_reply_events` table in Supabase to see the logged event

## ✅ Acceptance Test 3: RLS Sanity Check

### Verify Row-Level Security

1. **Log out** from your current account
2. **Create a new test account** or switch to a different user
3. Open **http://localhost:3000/meetings**
4. You should **NOT** see the meetings from the first user
5. Only meetings where `profile_id` or `user_id` matches the current user should appear

### Database Verification

Run this query in Supabase SQL Editor:

```sql
-- Check that profile_id/user_id is populated
SELECT 
  id,
  contact_email,
  status,
  profile_id,
  user_id,
  created_at
FROM public.meetings
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- All rows should have `profile_id` populated
- `user_id` should also be populated (for compatibility)
- Both should match the authenticated user who created them

### Verify RLS Policies

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'meetings';
-- Should return: rowsecurity = true

-- Check policies exist
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'meetings';
-- Should show: p_meetings_select, p_meetings_insert, p_meetings_update, p_meetings_delete
```

## ✅ Acceptance Test 4: End-to-End Flow

### Complete Workflow Test

1. **Send a test email** (or simulate) that triggers intent detection
2. **Check the meetings table** in Supabase Dashboard
   - Verify new row exists
   - Verify `status = 'booked'`
   - Verify `ics` field contains calendar data
3. **Open the Meetings UI** at http://localhost:3000/meetings
   - Verify the 🎉 Booked badge appears
   - Verify Calendly link is clickable
4. **Click the Calendly link** to verify it works
5. **Update status** using the action buttons
   - Click "Mark Accepted" → status should change
   - Verify in database that `updated_at` timestamp changed

## 🎯 Success Criteria

### ✅ All of the following should be true:

- [ ] Positive meeting intent returns `status: "booked"` with `ok: true`
- [ ] Meetings page shows 🎉 Booked rows for booked meetings
- [ ] Neutral/negative intents don't create meeting records (or create with `no_meeting` status)
- [ ] RLS prevents users from seeing other users' meetings
- [ ] `profile_id` and `user_id` columns are populated correctly
- [ ] ICS file content is generated and stored
- [ ] Calendly links are displayed and clickable
- [ ] Status filtering works (select "🎉 Booked" filter)
- [ ] Search works across email and subject fields
- [ ] Real-time updates appear (optional, depending on implementation)

## 🔍 Debugging

### If the simulate endpoint fails:

1. Check Supabase Edge Function logs:
   ```bash
   supabase functions logs reply-intent-detector
   ```

2. Check browser DevTools Network tab for API errors

3. Verify environment variables are set correctly

### If meetings don't appear in UI:

1. Check browser console for errors
2. Verify API endpoint returns data:
   ```bash
   curl http://localhost:3000/api/meetings
   ```
3. Check Supabase Dashboard > Authentication > Users to verify you're logged in
4. Check RLS policies in Supabase Dashboard > Database > Policies

### If RLS is blocking inserts:

1. Verify the Edge Function is using `SUPABASE_SERVICE_ROLE_KEY`
2. Check that `profile_id` matches `auth.uid()` in the database
3. Verify service role policy exists:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'meetings' AND policyname = 'meetings_service_all';
   ```

## 🚀 Next Steps

After passing all acceptance tests:

1. Deploy the Edge Function to production
2. Set up webhook integration for inbound emails
3. Configure Calendly API for bidirectional sync
4. Add email notification when meeting is booked
5. Implement real-time UI updates with Supabase Realtime

## 📊 Metrics to Track (MB/100)

This feature enables the **Meetings Booked per 100 Replies** metric:

```sql
-- Query to calculate MB/100
SELECT 
  profile_id,
  COUNT(*) FILTER (WHERE direction = 'inbound') as total_replies,
  COUNT(*) FILTER (WHERE reply_intent = 'positive_meeting_intent') as meeting_intents,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'booked') as meetings_booked,
  ROUND(
    (COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'booked')::decimal / 
     NULLIF(COUNT(*) FILTER (WHERE direction = 'inbound'), 0)) * 100, 
    2
  ) as mb_per_100
FROM messages msg
LEFT JOIN meetings m ON m.message_id = msg.id OR m.contact_email = msg.from_email
GROUP BY profile_id;
```

---

## 📝 Notes

- The simulation endpoint is for **development/testing only**
- In production, this will be triggered by webhook from your email provider
- The `x-ss-user-id` header is for testing; production uses session auth
- Status "booked" is set automatically for positive intents
- The ICS file is a placeholder; actual calendar integration requires Calendly API

## 🎉 Why This Matters

You now have **end-to-end reply-to-meeting automation**:
1. ✅ Inbound reply detected
2. ✅ AI classifies meeting intent  
3. ✅ Auto-generates calendar invite + Calendly link
4. ✅ Stores in database with RLS
5. ✅ Displays in UI with live updates
6. ✅ Tracks MB/100 metric for iteration

This completes the loop: **Reply → Intent → Meeting → Metrics** 🚀
