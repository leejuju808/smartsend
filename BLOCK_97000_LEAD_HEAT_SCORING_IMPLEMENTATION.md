# Block 97000 — Lead Heat Scoring + Hot Lead Fastlane System v1

**FULL IMPLEMENTATION — NO BULLSHIT**

## ✅ Implementation Complete

This block transforms SmartSend into the lead intelligence system roofers have never had. It detects reply intent, scores leads as HOT/WARM/COLD automatically, pushes hot leads to the top, triggers instant coaching messages, provides one-click reply templates, and logs follow-up timing for performance analytics.

## 📋 What Was Built

### 1. Database Schema ✅

**Migration File:** `supabase/migrations/20250130000002_block97000_lead_heat_scoring.sql`

Creates:
- `lead_heat_events` table - Tracks every classification event
- `hot_reply_templates` table - One-click response templates
- `lead_response_times` table - Performance analytics tracking
- Adds `heat_score` column to `leads` table
- Helper views and functions for analytics

### 2. Edge Function ✅

**File:** `supabase/functions/classifyLeadReply/index.ts`

- Receives homeowner reply → classifies it using OpenAI
- Categories: HOT, WARM, COLD, NOT_INTERESTED
- Updates `lead_heat_events` and `leads.heat_score`
- Returns intent and confidence score

**Deploy:**
```bash
cd supabase
supabase functions deploy classifyLeadReply
```

**Environment Variables (Supabase Dashboard → Edge Functions):**
- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_MODEL` (optional) - Defaults to "gpt-4o-mini"

### 3. API Routes ✅

**Hot Leads API:**
- `GET /api/hot-leads` - Get list of hot leads
- `GET /api/hot-leads/templates` - Get reply templates
- `POST /api/hot-leads/classify` - Trigger classification
- `POST /api/hot-leads/mark-replied` - Mark as replied + track response time
- `GET /api/hot-leads/analytics` - Get performance statistics

### 4. UI Components ✅

**Enhanced HotLeadsWidget:**
- `app/dashboard/_components/HotLeadsWidget.tsx`
- Shows hot leads at the top of dashboard
- Displays confidence scores and timestamps
- Links to detail page for one-click replies

**Hot Lead Detail Page:**
- `app/dashboard/hot-leads/[leadId]/page.tsx`
- Shows lead details, original reply, and one-click templates
- Includes "Mark Replied" button

**One-Click Reply Templates:**
- `app/dashboard/hot-leads/[leadId]/_components/HotLeadReplyTemplates.tsx`
- Displays templates with copy/use buttons
- Opens email client with pre-filled response

**Coaching Alert:**
- `components/dashboard/HotLeadCoachingAlert.tsx`
- Real-time banner when hot lead detected
- Polls every 10 seconds for new hot leads

**Performance Analytics:**
- `components/dashboard/HotLeadResponseTimeAnalytics.tsx`
- Shows average response time
- Tracks responses under 1 minute
- Gamification with elite responder badges

## 🚀 Setup Instructions

### 1. Run Database Migration

Execute in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20250130000002_block97000_lead_heat_scoring.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy classifyLeadReply
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → classifyLeadReply → Settings:
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_MODEL=gpt-4o-mini (optional)
```

### 4. Integrate with Reply Detection

When a reply is received, call the classification API:

```typescript
// Example: In your reply webhook handler
const response = await fetch('/api/hot-leads/classify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message_id: replyId,
    message: replyBody,
    lead_id: leadId,
    workspace_id: workspaceId,
  }),
});
```

### 5. Add Components to Dashboard

The components are already integrated in:
- `app/dashboard/page.tsx` - HotLeadsWidget, CoachingAlert, Analytics

## 🎯 How It Works

1. **Reply Detection** → Reply comes in via webhook
2. **Classification** → `classifyLeadReply` edge function analyzes intent
3. **Heat Scoring** → Lead is marked as HOT/WARM/COLD
4. **UI Update** → Hot leads appear at top of dashboard
5. **Coaching Alert** → Banner appears for new hot leads
6. **One-Click Reply** → Roofer clicks template, email opens
7. **Mark Replied** → Response time is tracked
8. **Analytics** → Performance metrics displayed

## 💰 Revenue Impact

This system directly increases booked estimates by:

1. **Instant Detection** - Roofers see hot leads immediately
2. **Speed Training** - System trains roofers to reply in seconds
3. **Removes Thinking** - Templates eliminate decision paralysis
4. **Gamification** - Response time tracking creates competition

## 🔥 Key Features

- ✅ Automatic intent classification (HOT/WARM/COLD)
- ✅ Real-time hot lead detection
- ✅ One-click reply templates
- ✅ Response time tracking
- ✅ Performance analytics
- ✅ Coaching alerts
- ✅ Gamification badges

## 📊 Default Templates

Three templates are seeded:
1. **Book Estimate Fast** - "We can stop by today or tomorrow. What time works for you?"
2. **Address Request** - "Can you send me the full address so I can check access + prep equipment?"
3. **Scheduling Confirmation** - "Got it. I'll lock you in for ____. See you then."

## 🎨 UI Locations

- **Dashboard:** Hot leads widget at top, coaching alert banner, analytics card
- **Hot Lead Detail:** `/dashboard/hot-leads/[leadId]` - Full lead view with templates
- **All Hot Leads:** Link from widget to view all hot leads (to be implemented)

## 🔧 Customization

### Add Custom Templates

Insert into `hot_reply_templates`:
```sql
INSERT INTO hot_reply_templates (workspace_id, title, body, subject)
VALUES (
  'your-workspace-id',
  'Your Template Name',
  'Your template body with {{FIRST_NAME}} placeholders',
  'Re: Your Subject'
);
```

### Adjust Classification Prompt

Edit `supabase/functions/classifyLeadReply/index.ts` to modify the classification criteria.

## 📈 Next Steps

1. **Integrate with existing reply detection** - Hook into your current webhook handlers
2. **Add email sending** - Connect templates to actual email sending
3. **Create hot leads list page** - View all hot leads in one place
4. **Add notifications** - Push notifications for hot leads
5. **Team leaderboards** - Compare response times across team

## 🐛 Troubleshooting

**Hot leads not showing:**
- Check that `heat_score` is being set on leads
- Verify edge function is being called
- Check API route logs

**Templates not loading:**
- Verify `hot_reply_templates` table has data
- Check RLS policies allow read access

**Analytics not updating:**
- Ensure `mark-replied` API is called when replying
- Check `lead_response_times` table has data

## ✅ Testing

1. Send a test reply with high intent language
2. Verify it's classified as HOT
3. Check dashboard shows the hot lead
4. Click template and verify email opens
5. Mark as replied and check analytics update

---

**This is the block where roofers say: "SmartSend told me EXACTLY when a hot lead replied. I closed 3 jobs just because it caught them instantly. Why the hell was I not using this earlier?"**

SmartSend becomes their instant-reaction engine. 🚀


























