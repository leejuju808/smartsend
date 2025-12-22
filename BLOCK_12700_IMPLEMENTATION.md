# Block 12700 — SmartSend Roofing Contact Merge v1 Implementation

## Overview
The Contact Merge Engine automatically identifies and merges duplicate homeowners so roofers don't have:
- The same person emailed twice
- Two threads with the same homeowner
- Double follow-ups
- Cluttered lists
- Messy data that kills deliverability

## What Was Implemented

### 1. Database Migration (`supabase/migrations/20250130000001_block12700_contact_merge_engine_v1.sql`)

#### Contact Merge Events Table
- `contact_merge_events` table for audit logging
- Tracks all merges (automatic and manual)
- Includes workspace_id, user_id, primary/merged contact IDs, reason, timestamp

#### Enhanced Duplicate Detection (`detect_contact_duplicates_v2`)
Four detection rules:
1. **Exact Email Match** (100% confidence) - Instant merge
2. **Same Name + Same Street** (90% confidence) - High confidence merge
3. **Same Email Domain + Partial Name Match** (70% confidence) - Catches variations like sarah@icloud.com and sara.h@icloud.com
4. **Same Phone** (85% confidence) - v2 enhancement

#### Enhanced Merge Function (`merge_contacts_v2`)
- **Status Priority**: HOT > WARM > NEW (keeps highest priority status)
- **Tag Union**: Combines all tags from both contacts, removes duplicates
- **Data Preservation**: Keeps most complete data (name, address, phone, etc.)
- **Timeline Union**: Merges notes, replies, timeline events, tasks, campaigns
- **Activity Logging**: Creates merge events in activity_events and contact_merge_events

#### Auto-Merge Engine (`auto_merge_contacts_hourly`)
- Processes all workspaces (or specific workspace)
- Auto-merges exact email matches
- Auto-merges name + street matches
- Returns detailed merge results per workspace

#### Helper Functions
- `get_contact_duplicate_count` - Returns count for UI badges
- `get_recent_merge_count` - Returns recent merges for dashboard notifications

### 2. API Endpoints

#### GET `/api/contacts/duplicates`
- Returns list of suspected duplicate contacts grouped by match type
- Used by manual merge tool

#### POST `/api/contacts/merge`
- Merges two contacts together
- Uses enhanced `merge_contacts_v2` function
- Supports reason parameter (exact_email, name_street, email_domain_name, phone, manual)

#### POST `/api/contacts/merge/auto`
- Manual trigger for auto-merge
- Can process specific workspace or all workspaces

#### GET `/api/contacts/duplicates/count`
- Returns duplicate count and recent merge count
- Used by UI badges and notifications

#### POST `/api/cron/contacts-auto-merge`
- Hourly cron job endpoint
- Processes all workspaces automatically
- Protected by CRON_SECRET

### 3. UI Components

#### `DuplicateMergeBadge` (`components/contacts/DuplicateMergeBadge.tsx`)
- Shows recent merge count: "X duplicates cleaned this week"
- Appears on dashboard/contacts page
- Clickable to navigate to merge tool

#### `DuplicateWarningBadge` (`components/contacts/DuplicateWarningBadge.tsx`)
- Shows duplicate count: "SmartSend cleaned X duplicate contacts"
- Appears on contacts page header

#### `CampaignDuplicateWarning` (`components/campaigns/CampaignDuplicateWarning.tsx`)
- Warning component for campaign builder
- Shows "X duplicates detected — SmartSend will send only once"
- Prevents double sending to same homeowner

### 4. Manual Merge Tool

#### Page: `/contacts/merge`
- Shows all suspected duplicate groups
- Displays match type, match score, match reason
- "Merge All" button for each group
- Individual "Merge into Primary" buttons
- Shows contact details (name, email, phone, address, tags)
- Uses MergeModal for individual merges

### 5. Cron Job Configuration

#### `vercel.json`
- Added hourly cron: `"0 * * * *"` → `/api/cron/contacts-auto-merge`
- Runs every hour to automatically merge duplicates

## Merge Behavior (v1 — Safe & Predictable)

When SmartSend merges contacts, it keeps ALL valuable data:

- ✅ Email (primary identifier)
- ✅ Most complete name
- ✅ Most complete address
- ✅ All tags from both contacts (union)
- ✅ Most accurate status (HOT > WARM > NEW)
- ✅ Combined notes
- ✅ Combined replies
- ✅ Combined timeline
- ✅ Combined campaigns participated in

**Nothing is lost.**

## Activity Log Integration

Merge events appear in Activity Log with message:
- "2 duplicate contacts merged: John Wilson → John Wilson"
- Shows in contact timeline
- Includes merge reason and metadata

## Why Roofers Will Love This

1. **No more emailing the same homeowner twice** - Huge trust benefit
2. **Cleaner lists = better deliverability** - Fewer dupes → fewer bounces
3. **Everything stays in ONE place** - Notes, statuses, replies all combined
4. **Zero effort required** - SmartSend does the cleaning automatically
5. **Makes SmartSend feel premium** - Roofers love when software "cleans up their mess"

## Technical Notes

- Uses `merged_into` column on contacts table to track merged contacts
- RLS policies hide merged contacts from normal queries
- Merge events are logged for audit trail
- Auto-merge runs hourly via cron job
- Manual merge tool available at `/contacts/merge`
- All merge operations preserve data integrity

## Files Created/Modified

### New Files
- `supabase/migrations/20250130000001_block12700_contact_merge_engine_v1.sql`
- `app/api/contacts/duplicates/route.ts`
- `app/api/contacts/duplicates/count/route.ts`
- `app/api/contacts/merge/auto/route.ts`
- `app/api/cron/contacts-auto-merge/route.ts`
- `components/contacts/DuplicateMergeBadge.tsx`
- `components/contacts/DuplicateWarningBadge.tsx`
- `components/campaigns/CampaignDuplicateWarning.tsx`
- `app/(app)/contacts/merge/page.tsx`

### Modified Files
- `app/api/contacts/merge/route.ts` - Updated to use `merge_contacts_v2`
- `app/(app)/contacts/duplicates/page.tsx` - Updated to use new API format
- `vercel.json` - Added hourly cron job

## Next Steps (Future Enhancements)

- v2: Phone-based duplicate detection (already planned)
- v2: Fuzzy name matching with similarity scoring
- v2: Bulk merge operations
- v2: Merge undo functionality (30-day window)
- v2: Merge preview before executing





















































