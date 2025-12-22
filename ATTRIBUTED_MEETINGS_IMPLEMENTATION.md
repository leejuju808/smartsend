# Attributed Meetings Implementation

This feature boosts MB/100 transparency by linking meetings back to the campaigns that drove them. Users can now see which campaigns are generating revenue through meetings.

## What It Does

- **Attributes meetings to campaigns** based on message history
- **Shows campaign performance** in the Health dashboard
- **Closes the revenue loop**: Sends → Replies → Meetings → $

## Files Created/Modified

### 1. Database Schema (`/supabase/sql/attributed_meetings.sql`)
- Adds `campaign_id` column to `meetings` table
- Creates `attribute_meeting_campaigns()` RPC function
- Creates `meetings_by_campaign` view for reporting

### 2. Metrics Library (`/src/lib/metrics/attributedMeetings.ts`)
- `fetchAttributedMeetings()` function
- Runs attribution RPC before fetching data
- Returns meetings grouped by campaign

### 3. Health Dashboard (`/src/app/dashboard/health/page.tsx`)
- Added "Meetings by Campaign" section
- Shows attribution data below existing health panels

## Implementation Steps

### Step 1: Apply Database Changes
1. Copy `/supabase/sql/attributed_meetings.sql`
2. Paste into Supabase SQL Editor
3. Run the script

### Step 2: Test the Implementation
1. Use `/scripts/test-attributed-meetings.sql` to create test data
2. Verify attribution works correctly
3. Check the health dashboard shows the new section

### Step 3: Verify in App
1. Visit `/dashboard/health`
2. Look for "Meetings by Campaign" section
3. Should show: "Attribution Test — 1 meetings"

## How Attribution Works

1. **When a meeting is created**: `campaign_id` starts as `NULL`
2. **Attribution process**: 
   - Find the contact's most recent message
   - Use that message's `campaign_id`
   - Update the meeting's `campaign_id`
3. **Display**: Shows campaign name and meeting count

## Attribution Logic

```sql
-- For each unattributed meeting:
-- 1. Get contact_id from meeting
-- 2. Find most recent message for that contact
-- 3. Use message's campaign_id
-- 4. Update meeting.campaign_id
```

## Benefits

- **Revenue transparency**: See which campaigns drive meetings
- **Campaign ROI**: Measure campaign effectiveness beyond opens/clicks
- **Better decision making**: Focus on high-performing campaigns
- **MB/100 insights**: Understand the full funnel from send to revenue

## Future Enhancements

- **Attribution confidence scoring**
- **Multi-touch attribution** (not just last message)
- **Time-based attribution windows**
- **Campaign performance analytics**

## Troubleshooting

### Common Issues

1. **No meetings showing**: Check if meetings have `contact_id` values
2. **Campaign names not showing**: Verify campaigns table has `name` field
3. **Attribution not working**: Check RPC function permissions

### Debug Queries

```sql
-- Check meetings without attribution
select * from public.meetings where campaign_id is null;

-- Check attribution function
select public.attribute_meeting_campaigns('your-profile-id');

-- Verify view data
select * from public.meetings_by_campaign;
```

## Security Notes

- Function uses `security invoker` (runs as calling user)
- Only authenticated users can execute attribution
- Data is scoped to user's profile_id 