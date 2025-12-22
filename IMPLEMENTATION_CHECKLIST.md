# MB/100 Analytics - Implementation Checklist

Use this checklist to verify your MB/100 analytics implementation.

## ✅ Pre-Implementation

- [x] All required dependencies installed (`@supabase/supabase-js`, `@supabase/ssr`)
- [ ] Environment variables configured in `.env.local`:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `NEXT_PUBLIC_BASE_URL` (optional, for production)

## ✅ Database Setup

- [ ] Migration applied: `20241016000000_analytics_mb100_views.sql`
  - [ ] Indexes created on `messages` table
  - [ ] Indexes created on `meetings` table
  - [ ] View created: `analytics_daily`
  - [ ] View created: `analytics_totals_30d`
  - [ ] View created: `analytics_sender_health_30d`

### Verify Views

Run in Supabase SQL Editor:

```sql
-- Should return rows if views exist
SELECT * FROM analytics_daily LIMIT 1;
SELECT * FROM analytics_totals_30d LIMIT 1;
SELECT * FROM analytics_sender_health_30d LIMIT 1;
```

## ✅ Backend Files

- [x] `src/lib/supabaseAdmin.ts` - Admin client (already exists)
- [x] `src/app/api/analytics/route.ts` - Analytics API endpoint

### Test API Endpoint

```bash
# Should return JSON (may be empty data array if no messages/meetings)
curl http://localhost:3000/api/analytics | jq
```

Expected response structure:
```json
{
  "days": 14,
  "data": [...]
}
```

## ✅ Frontend Files

- [x] `src/app/dashboard/analytics/page.tsx` - Analytics dashboard page

### Test UI

- [ ] Navigate to http://localhost:3000/dashboard/analytics
- [ ] Page loads without errors
- [ ] KPI cards are visible
- [ ] Sender table is visible
- [ ] If no data: "No data yet" message displays

## ✅ Test Data (Optional)

- [ ] Seed test data applied: `scripts/seed-analytics-test-data.sql`
- [ ] Verify test data exists:

```sql
-- Should show counts > 0
SELECT 
  COUNT(*) as total_messages,
  SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_messages
FROM messages
WHERE created_at >= now() - interval '30 days';

SELECT COUNT(*) as total_meetings
FROM meetings
WHERE invite_status IN ('sent', 'booked')
  AND created_at >= now() - interval '30 days';
```

## ✅ Functional Tests

### API Tests

Run: `./scripts/test-analytics-api.sh`

- [ ] Test 1: Get all analytics (14 days) - ✅ Passes
- [ ] Test 2: Get specific profile analytics - ✅ Passes
- [ ] Test 3: Get 7-day analytics - ✅ Passes
- [ ] Test 4: Get 90-day analytics - ✅ Passes
- [ ] Test 5: Response structure validation - ✅ Passes
- [ ] Test 6: Metrics extraction - ✅ Passes

### Manual UI Tests

- [ ] **KPI Cards display correctly:**
  - [ ] MB/100 shows as decimal (e.g., "25.00")
  - [ ] Replies → Meetings % shows as percentage (e.g., "25.00%")
  - [ ] Replies (30d) shows as integer
  - [ ] Sender Health shows as integer (e.g., "72/100")

- [ ] **Sender Table displays correctly:**
  - [ ] Profile IDs are shown
  - [ ] Replies, Meetings, MB/100, Health all display
  - [ ] Empty state shows if no data

- [ ] **Page Performance:**
  - [ ] Page loads in < 2 seconds
  - [ ] No console errors
  - [ ] Data is server-rendered (no loading spinner for data)

### Data Accuracy Tests

Create known data and verify calculations:

```sql
-- Example: Create 10 replies and 2 meetings
-- Expected MB/100: (2/10) * 100 = 20.00

-- Insert 10 inbound messages
-- Insert 2 meetings with status 'sent' or 'booked'
-- Check view:
SELECT * FROM analytics_totals_30d WHERE profile_id = 'YOUR_PROFILE_ID';
-- mb_per_100_30d should be 20.00
```

- [ ] MB/100 calculation is correct
- [ ] Sender health score is between 0-100
- [ ] Daily aggregation works correctly

## ✅ Edge Cases

- [ ] **No data scenario:**
  - [ ] New profile with no messages/meetings shows zeros
  - [ ] "No data yet" message displays on UI

- [ ] **Zero replies scenario:**
  - [ ] Profile with only outbound messages (no inbound)
  - [ ] MB/100 should be 0 (not null or error)

- [ ] **Zero meetings scenario:**
  - [ ] Profile with replies but no meetings
  - [ ] MB/100 should be 0
  - [ ] Sender health reflects reply volume only

- [ ] **Multiple profiles scenario:**
  - [ ] API returns data for all profiles when no filter
  - [ ] API filters correctly when `profileId` param provided
  - [ ] Aggregated KPIs average across all profiles

## ✅ Security & Performance

- [ ] API uses service role (bypasses RLS)
- [ ] No client secrets exposed in frontend
- [ ] Indexes improve query performance
- [ ] Views return data in < 500ms (check Supabase query performance)

### Test Performance

```sql
-- Run with EXPLAIN ANALYZE to check query plan
EXPLAIN ANALYZE
SELECT * FROM analytics_totals_30d;

EXPLAIN ANALYZE
SELECT * FROM analytics_daily
WHERE day >= CURRENT_DATE - INTERVAL '30 days';
```

- [ ] Queries use indexes (check for "Index Scan" in EXPLAIN output)
- [ ] No full table scans on large tables

## ✅ Documentation

- [x] Implementation guide created: `docs/MB100_ANALYTICS_IMPLEMENTATION.md`
- [x] Quick start guide created: `MB100_QUICK_START.md`
- [x] Test script created: `scripts/test-analytics-api.sh`
- [x] Seed data script created: `scripts/seed-analytics-test-data.sql`
- [x] This checklist created: `IMPLEMENTATION_CHECKLIST.md`

## ✅ Production Readiness

Before deploying to production:

- [ ] Migration tested on staging database
- [ ] Views verified on staging
- [ ] API tested on staging
- [ ] UI tested on staging
- [ ] Performance benchmarked with production-like data volume
- [ ] Error handling tested (database connection failures, missing env vars)
- [ ] Monitoring/logging configured
- [ ] Team trained on new metrics (what MB/100 means, how to interpret health score)

## ✅ Post-Deployment Verification

After deploying to production:

- [ ] Migration applied successfully
- [ ] No errors in production logs
- [ ] API endpoint accessible: `/api/analytics`
- [ ] UI accessible: `/dashboard/analytics`
- [ ] Metrics update as new messages/meetings are created
- [ ] Performance is acceptable (page loads < 2s)

## 📊 Success Metrics

After 7 days in production:

- [ ] Analytics page has been accessed by team members
- [ ] No errors reported
- [ ] Data accuracy confirmed (spot-check calculations)
- [ ] Performance meets SLA (< 2s page load)
- [ ] Team is using MB/100 to make decisions

## 🚀 Next Steps

Once core analytics is stable:

- [ ] Add campaign-level drill-down
- [ ] Build funnel visualization (Sends → Opens → Replies → Meetings)
- [ ] Add alerts for low health scores
- [ ] Implement A/B test tracking
- [ ] Add export functionality (CSV/PDF)
- [ ] Build team-level aggregations
- [ ] Add historical comparisons (30d vs 60d vs 90d)

## 🆘 Troubleshooting

If any checkbox fails, refer to:
- `docs/MB100_ANALYTICS_IMPLEMENTATION.md` - Section 9: Troubleshooting
- Supabase logs (Database → Logs)
- Application logs (`npm run dev` console output)
- Network tab in browser DevTools

Common issues:
1. **Views not found**: Re-run migration SQL
2. **No data**: Check messages/meetings tables, run seed script
3. **Wrong calculations**: Verify meeting statuses in SQL
4. **API errors**: Check service role key in .env.local

---

## ✅ Final Sign-Off

When all critical items are checked:

- [ ] Database setup complete
- [ ] API working
- [ ] UI working
- [ ] Tests passing
- [ ] Documentation complete

**Status**: Ready to ship! 🚀

**Deployed by**: _______________  
**Date**: _______________  
**Production URL**: _______________
