# CSV Import Quick Test Guide

## Prerequisites

1. Ensure Supabase is running locally or connected to project
2. Run database migration
3. Deploy Edge Function
4. Have a test campaign ready

## Setup (One-time)

### 1. Apply Database Migration

```bash
# Apply the migration
supabase db push

# Or manually in Supabase SQL Editor:
# Open supabase/migrations/20251031_csv_import_complete.sql
# Copy and execute in SQL Editor
```

### 2. Deploy Edge Function

```bash
supabase functions deploy import-leads
```

### 3. Verify Storage Bucket

In Supabase Dashboard → Storage:
- Bucket `app-uploads` should exist
- If not, create it (private bucket)

### 4. Create Test Campaign

Via UI or SQL:

```sql
INSERT INTO public.campaigns (name, status)
VALUES ('CSV Import Test', 'draft')
RETURNING id;
```

Save the campaign ID for testing.

## Quick Test (5 minutes)

### Step 1: Access Leads Page

Navigate to: `http://localhost:3000/leads` (or your local URL)

You should see:
- Campaign selector dropdown (shows your campaigns)
- "Import" button

### Step 2: Start Import

1. Click "Import" button
2. Click "Click to choose a CSV"
3. Select `seeds/sample_leads.csv` from project root

### Step 3: Map Columns

Auto-detected:
- Email → email
- First name → first_name
- Last name → last_name
- Company → company

Review and adjust if needed.

### Step 4: Preview & Import

- Preview shows first 5 rows
- Click "Start Import"
- Wait for completion (2-3 seconds)

### Step 5: Verify Results

Expected Toast:
```
Import complete
Inserted: 4, Skipped: 1, Failed: 2

Errors detected
Some rows failed validation. Download the error CSV to see details.
[Download CSV]
```

Lead Count: Should show 4 leads in table

### Step 6: Download Error CSV

Click "Download CSV" from toast to see:
- Row 3: bad-email → Invalid email format
- Row 5: bob+dup@example.com → Duplicate within file
- Row 6: diana@example → Invalid email format

### Step 7: Test Filters

1. Filter by "Failed" → 0 results (they were rejected, not inserted)
2. Filter by "New" → 4 results
3. Search "alice" → 1 result

### Step 8: Test Retry (Optional)

If you have failed leads from previous sends:

1. Create failed leads manually:
```sql
UPDATE public.leads 
SET status = 'failed', attempts = 1 
WHERE campaign_id = 'YOUR_CAMPAIGN_ID' 
LIMIT 2;
```

2. Refresh leads page
3. Filter by "Failed"
4. Select 2 leads
5. Click "Retry Failed"
6. Verify: Status → queued, Attempts → 2/3

## Expected Results

### From `seeds/sample_leads.csv`:

| Row | Email | Status | Reason |
|-----|-------|--------|--------|
| 1 | alice@example.com | ✅ Inserted | Valid |
| 2 | bob+dup@example.com | ✅ Inserted | First occurrence |
| 3 | bad-email | ❌ Failed | Invalid format |
| 4 | carl@example.com | ✅ Inserted | Valid |
| 5 | bob+dup@example.com | ❌ Failed | Duplicate in file |
| 6 | diana@example | ❌ Failed | Invalid format |
| 7 | emma@example.com | ✅ Inserted | Valid |

**Total**: 4 inserted, 1 skipped (duplicate), 2 failed

## Troubleshooting

### "Failed to load campaigns"

Possible causes:
- No campaigns in database
- Auth not working
- Wrong user_id

Fix:
```sql
-- Check campaigns
SELECT id, name, user_id FROM public.campaigns;

-- Create test campaign
INSERT INTO public.campaigns (name, status, user_id)
VALUES ('Test', 'draft', 'YOUR_USER_ID');
```

### "Import failed" with 500 error

Check Edge Function logs:
```bash
supabase functions logs import-leads --tail
```

Common issues:
- Missing `app-uploads` bucket → Create in Storage
- RLS blocking → Verify policies in migration
- Missing columns → Run migration

### Empty results after import

Check:
1. Campaign ID matches selected campaign
2. No RLS blocking reads
3. Refresh page

### Duplicates not skipped

Verify unique constraint:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'leads' 
AND indexname LIKE '%email%';
```

Should see:
- `leads_campaign_email_uniq` on `(campaign_id, lower(email))`
- `leads_user_email_uniq` on `(user_id, lower(email))`

## Advanced Testing

### Bulk Import Test

Generate 1000 leads:

```bash
N=1000 ts-node scripts/gen-csv.ts
```

Then import `seeds/bulk_leads.csv` (takes ~10 seconds)

### Duplicate Across Campaigns

1. Import to Campaign A
2. Import same CSV to Campaign B
3. Should succeed (different campaign_id)

### Duplicate Within Campaign

1. Import same file twice to same campaign
2. Second import should skip all rows
3. Toast shows: "Inserted: 0, Skipped: 7"

## Success Criteria

✅ All 10 todos completed  
✅ UI loads with campaign selector  
✅ CSV upload works  
✅ Column mapping auto-detects  
✅ Preview shows 5 rows  
✅ Import completes with toast  
✅ Error CSV downloads  
✅ Leads appear in table  
✅ Filters work  
✅ Bulk retry works (if applicable)  
✅ No linter errors  
✅ Migration applies cleanly  

## Next Steps

Once basic import works:

1. Test with your actual CSV format
2. Adjust column mapping as needed
3. Test retry with real failed sends
4. Monitor Edge Function logs for production
5. Consider adding progress indicators for large imports

---

**Status**: Ready for E2E testing 🚀

