# CSV Lead Import Feature

## Overview

SmartSend AI now supports bulk importing leads via CSV files with automatic column mapping, validation, and deduplication per workspace.

## Features

✅ **Drag & Drop Interface** - Easy CSV file upload  
✅ **Auto Column Mapping** - Automatically detects and maps common column names  
✅ **Manual Column Mapping** - User can manually map any CSV column to target fields  
✅ **Preview** - Shows first 50 rows before import  
✅ **Validation** - Email format validation and required field checking  
✅ **Deduplication** - Unique email per workspace (case-insensitive)  
✅ **Upsert Logic** - Updates existing leads or creates new ones  
✅ **Error Reporting** - Shows which rows had errors and why  
✅ **CSV Template** - Download template CSV for reference  

## Database Schema

### Migration: `supabase/migrations/20241220_leads_import.sql`

```sql
-- Adds workspace support to leads table
alter table public.leads
  add column if not exists workspace_id uuid references public.workspaces(id),
  add column if not exists email text not null default '',
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists status text not null default 'New',
  add column if not exists last_activity_at timestamptz;

-- Unique email per workspace (case-insensitive)
create unique index if not exists ux_leads_ws_email
  on public.leads (workspace_id, lower(email));

-- Fast workspace lookups
create index if not exists idx_leads_ws on public.leads(workspace_id);

-- RLS policies
alter table public.leads enable row level security;
create policy "leads_rw" on public.leads
  for select using (public.is_workspace_member(workspace_id))
, for insert with check (public.is_workspace_member(workspace_id))
, for update using (public.is_workspace_member(workspace_id));
```

## API Endpoints

### Import Leads
**POST** `/api/leads/import`

Request body:
```json
{
  "workspace_id": "uuid",
  "rows": [
    {
      "__row": 2,
      "email": "jane@acme.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "company": "Acme Inc"
    }
  ]
}
```

Response:
```json
{
  "inserted": 42,
  "updated": 5,
  "skipped": 3,
  "errors": []
}
```

### Download Template
**GET** `/api/leads/template`

Returns a CSV template file with sample data.

## UI Components

### Import Page
**Path**: `/dashboard/leads/import?ws=<workspace_id>`

Features:
- Drag & drop CSV upload
- Auto-detection of column headers
- Manual column mapping dropdown
- Live preview of mapped data
- Import button (disabled until email column is mapped)
- Results summary with inserted/updated/skipped counts
- Error list showing problematic rows

### Supported CSV Fields

| Target Field | Required | Auto-Detected Patterns |
|-------------|----------|------------------------|
| email | ✅ Yes | "email", "e-mail" |
| first_name | No | "first", "firstname", "fname" |
| last_name | No | "last", "lastname", "lname" |
| company | No | "company", "organization", "org" |
| skip | N/A | Everything else |

## Usage

1. Navigate to `/dashboard/leads/import?ws=<workspace_id>`
2. Drag & drop your CSV file or click "Choose file"
3. Review and adjust column mappings if needed
4. Preview the first 50 rows to verify data
5. Click "Import" to start the import process
6. Review results summary

## CSV Format

Minimum required format:
```csv
email,first_name,last_name,company
jane@acme.com,Jane,Doe,Acme Inc
john@example.com,John,Smith,Example Corp
```

All fields except `email` are optional.

## Security

- **RLS Enforcement**: All operations respect workspace membership
- **Email Validation**: Strict regex validation for email addresses
- **Workspace Scoping**: Unique email constraint per workspace
- **Case Insensitivity**: "John@Example.com" and "john@example.com" are treated as the same lead

## Error Handling

Common errors and how they're handled:

1. **Missing email**: Row is skipped (counted in `skipped`)
2. **Invalid email format**: Added to `errors` array with row number
3. **Duplicate email**: Updates existing lead (counted in `updated`)
4. **Empty CSV**: Returns empty result with 0 counts
5. **Missing workspace_id**: Returns 400 error

## Technical Stack

- **Frontend**: Next.js 15, React, shadcn/ui
- **Parsing**: PapaParse for CSV parsing
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Validation**: Email regex + required field checks

## Future Enhancements

- [ ] Support for additional custom fields
- [ ] Bulk delete/archive
- [ ] Import history tracking
- [ ] Scheduled imports
- [ ] XLSX file support
- [ ] Import templates for different industries 