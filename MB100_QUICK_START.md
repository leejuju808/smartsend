# MB/100 Analytics - Quick Start

> **TL;DR**: New analytics system to track "Meetings per 100 Replies" (MB/100) — the key metric for outbound sales effectiveness.

## What's New

✨ **Server-side analytics** with proper MB/100 tracking  
📊 **Sender Health Score** (0-100) based on volume + conversion  
🎯 **KPI Dashboard** at `/dashboard/analytics`  
🔌 **API Endpoint** at `/api/analytics`  

## Installation (5 minutes)

### Step 1: Apply Database Migration

Open Supabase SQL Editor and run:

```bash
supabase/migrations/20241016000000_analytics_mb100_views.sql
```

This creates 3 views:
- `analytics_daily` - Daily rollup of replies & meetings
- `analytics_totals_30d` - 30-day aggregated metrics
- `analytics_sender_health_30d` - Health score calculation

### Step 2: Environment Variables

Ensure these are in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Step 3: (Optional) Seed Test Data

```bash
# In Supabase SQL Editor, run:
scripts/seed-analytics-test-data.sql
```

This creates:
- 20 inbound replies
- 5 meetings (sent/booked)
- Expected MB/100: 25.00

### Step 4: Test

```bash
# Start dev server
npm run dev

# Test API
./scripts/test-analytics-api.sh

# Open UI
open http://localhost:3000/dashboard/analytics
```

## Key Metrics Explained

### MB/100 (Meetings per 100 Replies)
- **What**: (Meetings ÷ Replies) × 100
- **Good**: > 20
- **Great**: > 30
- **Example**: 5 meetings from 20 replies = 25 MB/100

### Sender Health Score (0-100)
- **Calculation**: 60% MB/100 + 40% reply volume (normalized)
- **Why**: Balances conversion quality with activity level
- **Good**: > 60
- **Great**: > 80

### Replies → Meetings %
- Same as MB/100, just expressed as percentage
- Useful for non-technical stakeholders

## API Usage

### Get All Analytics

```bash
GET /api/analytics?days=14
```

Response:
```json
{
  "days": 14,
  "data": [
    {
      "profile_id": "uuid",
      "totals": {
        "replies_30d": 50,
        "meetings_30d": 12,
        "mb_per_100_30d": 24.00,
        "replies_to_meetings_pct_30d": 24.00
      },
      "daily": [...],
      "sender_health_score": 72.5
    }
  ]
}
```

### Get Specific Profile

```bash
GET /api/analytics?profileId={uuid}&days=30
```

## UI Access

Navigate to:
```
http://localhost:3000/dashboard/analytics
```

You'll see:
- **4 KPI Cards**: MB/100, Reply→Meeting %, Replies, Health
- **Sender Table**: Per-profile breakdown
- **Auto-filtered**: Shows your own profile data when logged in

## Troubleshooting

### "No data yet"
1. Check that you have `messages` with `direction = 'inbound'`
2. Check that you have `meetings` with `invite_status IN ('sent', 'booked')`
3. Ensure dates are within last 90 days
4. Run the seed script to create test data

### View errors
Re-run the migration SQL in Supabase SQL Editor

### API 500 errors
1. Check `SUPABASE_SERVICE_ROLE_KEY` is set
2. Check server logs: `npm run dev`
3. Test views directly in Supabase:
   ```sql
   SELECT * FROM analytics_totals_30d LIMIT 5;
   ```

## What Counts as a "Meeting"?

Currently: `meetings` table with `invite_status IN ('sent', 'booked')`

To change this, edit the view:
```sql
-- In analytics_daily view, find this line:
CASE WHEN mt.invite_status IN ('sent','booked') THEN 1 ELSE 0 END

-- Change statuses as needed:
CASE WHEN mt.invite_status IN ('confirmed','completed') THEN 1 ELSE 0 END
```

## Files Modified/Created

**Database:**
- `supabase/migrations/20241016000000_analytics_mb100_views.sql` - Views & indexes

**API:**
- `src/app/api/analytics/route.ts` - Main analytics endpoint

**UI:**
- `src/app/dashboard/analytics/page.tsx` - Analytics dashboard

**Admin:**
- `src/lib/supabaseAdmin.ts` - Already existed (no changes needed)

**Docs:**
- `docs/MB100_ANALYTICS_IMPLEMENTATION.md` - Full implementation guide
- `scripts/seed-analytics-test-data.sql` - Test data generator
- `scripts/test-analytics-api.sh` - API test script
- `MB100_QUICK_START.md` - This file

## Next Steps

1. ✅ Apply migration
2. ✅ Seed test data
3. ✅ Test API & UI
4. 🎯 **Roll out to production**
5. 🎯 Monitor MB/100 across team
6. 🎯 Set alerts for low health scores
7. 🎯 Build campaign-level analytics (next slice)

## Support

- Full docs: `docs/MB100_ANALYTICS_IMPLEMENTATION.md`
- API test: `./scripts/test-analytics-api.sh`
- Seed data: `scripts/seed-analytics-test-data.sql`

---

**Ready to ship?** 🚀

Run the test script and visit `/dashboard/analytics` to verify everything works!
