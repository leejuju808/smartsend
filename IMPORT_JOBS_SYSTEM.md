# Import Jobs System

A comprehensive CSV import system for leads with job tracking, validation, and deduplication.

## Overview

This system implements a structured 3-step import process:
1. **Upload** - CSV file upload with sample extraction
2. **Mapping** - Column mapping with live preview
3. **Processing** - Full validation, deduplication, and bulk import

## Database Schema

### Import Jobs Table
Tracks import jobs with status and progress:
- `id` - UUID primary key
- `team_id` - Team/workspace scope
- `user_id` - User who initiated the import
- `filename` - Original CSV filename
- `total_rows` - Total rows in CSV
- `imported_rows` - Successfully imported rows
- `status` - Pending, Mapping, Processing, Done, Error
- `error` - Error message if failed
- `created_at`, `updated_at` - Timestamps

### Import Job Rows Table
Stores individual row validation results:
- `id` - BigSerial primary key
- `job_id` - Reference to import_jobs
- `row_number` - Original row number in CSV
- `raw` - JSONB of parsed row data
- `valid` - Boolean validation status
- `errors` - Array of error messages
- `deduped` - Boolean for duplicates

## API Endpoints

### POST `/api/imports/start`
Uploads CSV file and creates import job.

**Request:**
- FormData with `file` (CSV) and `team_id`

**Response:**
```json
{
  "job_id": "uuid",
  "header": ["Email", "First Name", ...],
  "sampleRows": [...],
  "total_rows": 1500
}
```

### POST `/api/imports/process`
Triggers full validation and import via Edge Function.

**Request:**
```json
{
  "job_id": "uuid",
  "mapping": {
    "email": "Email",
    "name": "Full Name",
    "company": "Company",
    "custom": {}
  },
  "fileText": "csv content as string"
}
```

**Response:**
```json
{
  "ok": true,
  "imported": 1425,
  "total": 1500
}
```

## Supabase Edge Function

### `processImport`
Validates and imports leads server-side:

1. Parses full CSV
2. Validates email format
3. Checks duplicates within team
4. Stores validation results in `import_job_rows`
5. Bulk inserts valid leads into `leads` table
6. Updates job status to Done

**Performance:**
- Batch processing (1000 rows per batch)
- Prefetches existing emails for deduplication
- Handles large files efficiently

## UI Component

### Import Wizard Page
Located at `/src/app/(dashboard)/leads/import/page.tsx`

**Features:**
- 3-step wizard interface
- Drag & drop CSV upload
- Column mapping UI
- Live preview of first 10 rows
- Progress indicators
- Error handling

**Steps:**
1. **Upload** - File selection and preview
2. **Mapping** - Map CSV columns to lead fields
3. **Processing** - Validation and import results

## RLS Policies

### Import Jobs
- **Read**: Team members can view jobs for their teams
- **Create**: Team members can create import jobs
- **Update**: Job creator can update their own jobs

### Import Job Rows
- **Read**: Team members can view rows for their team's jobs
- **Insert**: Team members can insert rows for their team's jobs

## Validation & Deduplication

### Email Validation
- Format regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Rejects missing or invalid emails

### Deduplication
- Checks against existing team leads
- Marks duplicates within same import
- Prevents duplicate inserts

### Error Tracking
Each invalid row stores errors in array:
- "Missing email"
- "Invalid email"
- "Duplicate"

## Migration

Apply migration:
```bash
supabase db push
# or apply manually: supabase/migrations/20250216000003_import_jobs_system.sql
```

## Usage Example

```typescript
// 1. Upload CSV
const fd = new FormData();
fd.append("file", csvFile);
fd.append("team_id", teamId);

const startRes = await fetch("/api/imports/start", {
  method: "POST",
  body: fd,
});
const { job_id, header, sampleRows } = await startRes.json();

// 2. Map columns
const mapping = {
  email: "Email",
  name: "Full Name",
  company: "Company"
};

// 3. Process import
const processRes = await fetch("/api/imports/process", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    job_id,
    mapping,
    fileText: csvContent
  })
});
const { imported, total } = await processRes.json();
```

## Future Enhancements

- Async processing with webhooks
- Progress tracking with polling
- Email notifications on completion
- Export error reports to CSV
- Custom field mapping UI
- Integration with suppression lists
- Support for TSV and Excel formats

