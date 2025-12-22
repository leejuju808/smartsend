# CSV Lead Importer V1 - Implementation Summary

This document outlines the complete CSV import implementation for the SmartSend AI leads system.

## Overview

The CSV importer allows users to upload CSV files, map columns to lead fields, validate data, and import leads into campaigns. It includes comprehensive error handling and generates downloadable error reports.

## Components Implemented

### 1. UI Component: `ImportLeadsModal.tsx`

**Location:** `src/app/(dashboard)/leads/_components/ImportLeadsModal.tsx`

**Features:**
- Drag-and-drop file upload
- CSV parsing with Papa Parse
- Column mapping UI (email required, first_name, last_name, company optional)
- Live preview of first 5 rows
- Toast notifications for success/errors
- Downloadable error CSV when validation fails

**Usage:**
```tsx
<ImportLeadsModal 
  open={open} 
  onOpenChange={setOpen} 
  campaignId={campaignId} 
/>
```

### 2. Edge Function: `import-leads`

**Location:** `supabase/functions/import-leads/index.ts`

**Features:**
- CSV parsing with Papa Parse
- Email validation (regex-based)
- Duplicate detection (within file and database)
- Batch insert processing (1000 rows per batch)
- Error CSV generation and storage
- Returns detailed statistics (inserted, skipped, failed)

**Endpoint:** `POST /functions/v1/import-leads`

**Request Format:**
```
FormData:
- file: CSV file
- campaign_id: UUID
- mapping: JSON string with {email, first_name?, last_name?, company?}
```

**Response Format:**
```json
{
  "inserted": 45,
  "skipped_duplicates": 5,
  "failed": 10,
  "error_csv_url": "https://signed-url-to-error-csv"
}
```

### 3. Database Migration

**Location:** `supabase/migrations/20251030_csv_import_setup.sql`

**Changes:**
- Adds unique constraint on `(campaign_id, email)` to prevent duplicates
- Creates index on `campaign_id` for faster queries
- Creates `app-uploads` storage bucket for error CSV storage
- Adds RLS policies for storage access

### 4. Leads Page Integration

**Location:** `src/app/(dashboard)/leads/page.tsx`

Added "Import" button that opens the ImportLeadsModal with proper state management.

## Setup Instructions

### 1. Run Database Migration

```bash
# Via Supabase CLI
supabase db push

# Or manually in Supabase SQL editor
# Run contents of supabase/migrations/20251030_csv_import_setup.sql
```

### 2. Deploy Edge Function

```bash
supabase functions deploy import-leads
```

### 3. Set Environment Variables

The Edge Function requires:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

These are typically already configured in Supabase Dashboard → Edge Functions → Settings → Secrets.

### 4. Verify Storage Bucket

In Supabase Dashboard → Storage:
- Verify `app-uploads` bucket exists
- Confirm RLS policies are active
- Test by uploading a file manually

## User Flow

1. User clicks "Import" button on Leads page
2. Modal opens with file upload area
3. User selects CSV file → Preview appears with column mapping
4. User maps email column (required) and optionally maps first_name, last_name, company
5. User clicks "Start Import"
6. System validates data:
   - Email format check
   - Duplicate detection (within file)
   - Duplicate detection (in database for campaign)
7. Valid rows are inserted in batches
8. Invalid rows generate error CSV stored in `app-uploads/im

ports/{campaign_id}/{timestamp}.errors.csv`
9. User receives toast with results and optional download link for errors

## Error Handling

The system handles several error scenarios:
- **Missing email**: Row skipped, error logged
- **Invalid email format**: Row skipped, error logged
- **Duplicate in file**: Second occurrence skipped, error logged
- **Duplicate in database**: Row skipped (counted as `skipped_duplicates`), no error
- **Database insert failures**: Attempts upsert with ON CONFLICT, if still fails, error logged
- **Exceeds 10k rows**: Entire import rejected with error message

## Testing

### Manual Test

1. Create a test CSV with 7 rows:
   ```
   email,first_name,last_name,company
   valid1@example.com,John,Doe,Acme Corp
   valid2@example.com,Jane,Smith,Tech Inc
   invalid-email,Test,User,Bad Corp
   valid3@example.com,Bob,Johnson,Startup Co
   valid1@example.com,Duplicate,Row,Same Email
   notanemail,Another,Test,Bad Data
   valid4@example.com,Alice,Williams,Big Corp
   ```

2. Import to test campaign
3. Expected results:
   - inserted: 4
   - skipped_duplicates: 0 (unless already in DB)
   - failed: 3
   - error_csv_url: present

4. Download error CSV to verify it contains:
   - Row 3: invalid-email
   - Row 5: valid1@example.com (duplicate)
   - Row 6: notanemail

## Limitations

- **Max rows:** 10,000 per file
- **Batch size:** 1,000 rows per database operation
- **Required field:** Email only
- **Optional fields:** first_name, last_name, company
- **File format:** CSV only (.csv)

## Future Enhancements

Potential improvements:
- Progress bar for large imports
- Background job processing for files > 1k rows
- Support for additional fields (phone, title, website, etc.)
- Excel file support (.xlsx)
- Import templates
- Scheduled imports
- Import history/audit log

## API Usage (Alternative)

You can also call the Edge Function directly from code:

```typescript
const formData = new FormData();
formData.append("file", csvFile);
formData.append("campaign_id", campaignId);
formData.append("mapping", JSON.stringify({
  email: "email",
  first_name: "first_name",
  last_name: "last_name",
  company: "company"
}));

const response = await fetch(`${supabaseUrl}/functions/v1/import-leads`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${supabaseAnonKey}`
  },
  body: formData
});

const result = await response.json();
```

## Troubleshooting

### "Missing file, campaign_id, or mapping"
Check that FormData includes all three fields.

### "Exceeds max rows"
Split CSV into multiple files of 10k rows or fewer.

### "Duplicate email in database"
This is expected behavior. Rows are skipped silently and counted in `skipped_duplicates`.

### Error CSV not generating
Check storage bucket permissions and RLS policies. Verify service role has write access.

### Import slow
Large imports may take time due to batch processing. Consider implementing progress indicators for UX improvement.

