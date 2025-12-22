# Quick Start - Analytics Dashboard

## 🚀 Get Started in 3 Steps

### 1️⃣ Apply Database Migration
```bash
cd /Users/juju/smartsend-ai
supabase db push
```

### 2️⃣ Seed Test Data
1. Get your profile ID:
   ```sql
   -- Run in Supabase SQL Editor
   SELECT id FROM profiles WHERE id = auth.uid();
   ```

2. Edit `supabase/sql/analytics_test_seed.sql`
   - Replace `YOUR_PROFILE_ID` (appears twice) with your actual UUID

3. Run the seed script in Supabase SQL Editor

### 3️⃣ View Dashboard
```bash
pnpm dev
```
Visit: **http://localhost:3000/analytics**

## ✅ What You Should See

- **MB/100 Card** (highlighted): ~54.5
- **Replies**: 11
- **Meetings**: 6
- **Bounce Rate**: ~6.2%
- **Campaign Table**: 1 campaign with metrics
- **7-Day Trends**: Daily sparklines

## 🧪 Test API Endpoints

Replace `PROFILE_ID` with your UUID:

```bash
# Overview
curl "http://localhost:3000/api/analytics/overview?profile_id=PROFILE_ID" | jq

# Time Series (last 30 days)
curl "http://localhost:3000/api/analytics/timeseries?profile_id=PROFILE_ID" | jq

# Campaign Leaderboard
curl "http://localhost:3000/api/analytics/by-campaign?profile_id=PROFILE_ID" | jq
```

## 📊 Expected Test Data

- **65 messages** across 5 days
- **11 total replies** (7 with positive intent)
- **6 meetings booked** 
- **4 bounces**
- **MB/100: 54.5** (6 meetings ÷ 11 replies × 100)

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| "View does not exist" | Run `supabase db push` |
| No data showing | Run seed script with your profile_id |
| "Missing profile_id" | Check `/api/me` endpoint works |
| MB/100 shows 0 | Need replied messages + meetings |

## 📁 Files Created

- ✅ Migration: `supabase/migrations/20251008_analytics.sql`
- ✅ API: `src/app/api/analytics/{overview,timeseries,by-campaign}/route.ts`
- ✅ UI: `src/app/(dashboard)/analytics/page.tsx`
- ✅ Seed: `supabase/sql/analytics_test_seed.sql`

## 📖 Full Documentation

See `ANALYTICS_IMPLEMENTATION.md` for complete details on:
- Architecture & data flow
- Integration with reply intent
- Performance considerations
- Next steps & enhancements

---

**Ready to go?** Run the 3 steps above and you'll have a working MB/100 analytics dashboard! 🎉
