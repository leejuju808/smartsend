# CSV Lead Import v1 - Complete Implementation

## Overview
This document describes the complete CSV Lead Importer implementation for SmartSend AI, enabling users to upload, map, validate, and import leads in bulk.

## Architecture

### Flow
1. **UI** → User uploads CSV in `ImportLeadsModal`
2. **UI** → User maps CSV columns to lead fields
3. **UI** → Preview shows first 5 rows
4. **API** → Edge Function receives file via FormData
5. **Edge Function** → Parses CSV, validates emails, deduplicates
6. **Database** → Batch inserts with conflict handling
7. **Storage** → Error CSV uploaded if validation fails
8. **UI** → Success/error toast with download link for failures

### Components

#### 1. UI Components

##### `ImportLeadsModal.tsx`
Location: `src/app/(dashboard)/leads/_components/ImportLeadsModal.tsx`

Features:
- CSV file upload (drag & drop or click)
- Automatic header detection with PapaParse
- Column mapping UI (Email*, First Name, Last Name, Company)
- Preview table (first 5 rows)
- Direct Edge Function integration
- Error CSV download

Usage:
```tsx
<ImportLeadsModal 
  open={open} 
  onOpenChange={setOpen} 
  campaignId={campaignId} 
/>
```

##### `LeadsTable.tsx`
Location: `src/app/(dashboard)/leads/LeadsTable.tsx`

Features:
- Filter by status, search, date range
- Bulk select for retry
- Pagination (25/page)
- Sticky header
- Attempts display (X/3)

##### `leads/page.tsx`
Location: `src/app/(dashboard)/leads/page.tsx`

Features:
- Campaign selector dropdown
- Import button
- Auto-loads first campaign

#### 2. API Routes

##### `/api/leads/list` (GET/POST)
Location: `src/app/api/leads/list/route.ts`

Query parameters:
- `campaignId` (required)
- `status` (all/new/queued/sending/sent/failed/replied)
- `search` (email/name/company)
- `dateFrom`, `dateTo`
- `page`, `pageSize` (default: 25)

Response:
```json
{
  "rows": [...],
  "total": 100,
  "page": 1,
  "pageSize": 25
}
```

##### `/api/leads/retry` (POST)
Location: `src/app/api/leads/retry/route.ts`

Body:
```json
{
  "leadIds": ["uuid1", "uuid2"],
  "actorId": "user-uuid" // optional, uses auth user if not provided
}
```

Response:
```json
{
  "updated": 2
}
```

##### `/api/campaigns/list` (GET)
Location: `src/app/api/campaigns/list/route.ts`

Returns user's campaigns with fallback:
1. Try `v_campaign_metrics` view
2. Fallback to `campaigns` table

Response:
```json
{
  "rows": [...],
  "campaigns": [...]
}
```

#### 3. Edge Function

##### `import-leads`
Location: `supabase/functions/import-leads/index.ts`

Request:
- FormData with `file`, `campaign_id`, `mapping`
- Calls direct from client (anon key)

Process:
1. Parse CSV with PapaParse
2. Validate emails (regex)
3. Dedupe within file
4. Batch insert (1000 at a time)
5. On unique violation: query existing, filter, retry insert
6. Generate error CSV if failures
7. Upload error CSV to storage
8. Return signed URL for download

Response:
```json
{
  "inserted": 4,
  "skipped_duplicates": 3,
  "failed": 3,
  "error_csv_url": "https://..."
}
```

Limits:
- Max 10,000 rows per file
- Batch size: 1000
- Email validation: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`

#### 4. Database

##### Migration
Location: `supabase/migrations/20251031_csv_import_complete.sql`

Changes:
1. Add `attempts` (int, default 0)
2. Add `max_attempts` (int, default 3)
3. Ensure `user_id`, `campaign_id` exist
4. Update status check constraint
5. Unique index on `(campaign_id, lower(email))`
6. Separate unique index for user-level (when campaign_id is null)
7. Indexes for `campaign_id`, `status`, `email`
8. Storage bucket `app-uploads`
9. RLS policies for uploads
10. `retry_leads(uuid[], uuid)` RPC
11. Email normalization trigger
12. Updated_at trigger

##### RPC: retry_leads
```sql
retry_leads(_lead_ids uuid[], _actor uuid) → int
```

Logic:
- Update status → 'queued'
- Increment attempts
- Only if status in ('failed', 'sending', 'bounced')
- Only if attempts < max_attempts
- Returns count updated

##### Constraints
- Unique: `(campaign_id, lower(email))` where campaign_id is not null
- Unique: `(user_id, lower(email))` where campaign_id is null
- Email auto-lowercased on insert/update

## Seed Files

### `seeds/sample_leads.csv`
7 test rows with:
- 2 valid
- 2 duplicates (bob+dup@example.com)
- 2 invalid emails
- 1 valid

### `scripts/gen-csv.ts`
Generate bulk CSV:
```bash
N=500 ts-node scripts/gen-csv.ts
# Creates seeds/bulk_leads.csv with 500 rows
```

### `seeds/seed_campaign.sql`
Manual SQL to create test campaign and failed leads for retry testing.

### `scripts/seed-import.ts`
Automated seed script:
```bash
ts-node scripts/seed-import.ts
```

Usage:
```bash
CAMPAIGN_NAME="My Test" CSV_PATH="seeds/bulk_leads.csv" ts-node scripts/seed-import.ts
```

## Testing

### E2E Flow

1. **Create campaign**
   - Go to campaigns page
   - Create or select existing

2. **Import CSV**
   - Go to leads page
   - Click "Import"
   - Upload `seeds/sample_leads.csv`
   - Map columns (auto-detects email)
   - Preview rows
   - Click "Start Import"

3. **Verify**
   - Toast shows: Inserted: 4, Skipped: 2, Failed: 3
   - Leads table refreshes
   - Download error CSV to see failures

4. **Filter & Retry**
   - Filter by "failed"
   - Select 2 failed leads
   - Click "Retry Failed"
   - Status → queued, attempts incremented

5. **Edge Cases**
   - Duplicate emails in same campaign → skipped
   - Invalid email format → failed
   - Empty email → failed
   - >10k rows → rejected at Edge Function

### Test Data

`seeds/sample_leads.csv` breakdown:
- `alice@example.com` → inserted
- `bob+dup@example.com` (first) → inserted
- `bad-email` → failed (invalid format)
- `carl@example.com` → inserted
- `bob+dup@example.com` (second) → skipped (duplicate in file)
- `diana@example` → failed (no TLD)
- `emma@example.com` → inserted

Expected: 4 inserted, 1 skipped (duplicate), 2 failed

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for Edge Function)

## Deployment

### 1. Database Migration
```bash
supabase migration up
```

### 2. Deploy Edge Function
```bash
supabase functions deploy import-leads
```

### 3. Verify Storage Bucket
In Supabase dashboard → Storage:
- Check `app-uploads` bucket exists
- Verify RLS policies are active

### 4. Test Import
Use `seeds/sample_leads.csv` to verify end-to-end.

## Future Enhancements

- [ ] Background job for large imports (>10k)
- [ ] Progress indicator for batched imports
- [ ] Custom field mapping beyond standard 4
- [ ] Preview before final import
- [ ] Undo/rollback import
- [ ] Import history/audit log
- [ ] Email validation service integration
- [ ] Rate limiting per user

## Troubleshooting

### Import fails with 500
- Check Edge Function logs: `supabase functions logs import-leads`
- Verify storage bucket exists
- Check RLS policies allow inserts

### Duplicates not skipped
- Verify unique constraint exists
- Check if campaign_id is set correctly

### Email not lowercased
- Confirm normalization trigger is active
- Check trigger order

### Retry doesn't work
- Verify RPC function exists: `SELECT * FROM pg_proc WHERE proname = 'retry_leads'`
- Check attempts < max_attempts
- Confirm lead status is eligible

## Support

For issues or questions:
1. Check logs (Edge Function + Next.js)
2. Verify database constraints
3. Test with sample CSV
4. Review error CSV download

---

**Status**: ✅ Complete and ready for E2E testing

