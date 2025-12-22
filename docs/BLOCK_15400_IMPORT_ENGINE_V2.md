# Block 15400 — SmartSend Import Engine v2

## Overview

Import Engine v2 transforms SmartSend's import experience into a premium, idiot-proof system that can handle ANY roofing list, even if it's messy or poorly formatted.

## Key Features

### 1. Smart Auto-Mapping
- Analyzes first 100 rows (not just headers)
- Uses heuristics + pattern matching to guess column mappings
- Supports common roofing field types:
  - Email (email, Email Address, primary_email, homeowner email)
  - Names (name, full_name, First & Last, homeowner)
  - Address fields (city, state, zip, address)
  - Phone, notes, tags, past quote amounts
- Shows confidence scores and suggestions

### 2. Import Presets
Quick presets for common roofing sources:
- **Google Sheets Export**
- **JobNimbus Export** (CRM export)
- **Yard Sign / Canvassing Sheet**
- **Website Form Export**
- **Storm Lead Vendor**

Each preset includes:
- Likely column mappings
- Default tags (e.g. `storm_vendor`, `website_lead`)
- Recommended send caps for sketchy sources

### 3. One-Click Clean-Up
Before import, users can click "🧹 Clean This List Before Import" which:
- Strips leading/trailing spaces
- Normalizes case (JOHN → John)
- Removes obvious garbage rows
- Formats ZIP codes
- Collapses duplicate spaces in names
- Trims long text fields
- Normalizes email addresses

Shows summary: "34 rows cleaned", "12 emails normalized", "5 duplicate names merged"

### 4. Danger Score
Each import gets a safety indicator:
- 🟢 **Safe** - Good data quality
- 🟡 **Caution** - Some issues detected
- 🔴 **Risky** - High risk of problems

Based on:
- % missing emails
- % invalid emails
- % obvious duplicates
- Domain reputation status
- Whether list looks like a bought list
- Storm/vendor tag patterns

Shows warnings and recommendations for risky imports.

### 5. Chunked Processing & Resume
- Large imports split into chunks (1,000 rows at a time)
- Progress tracked in `import_sessions` table
- If failure occurs, user sees: "Import interrupted at 3,200/5,000 contacts — click to resume"
- No more starting over

### 6. Import Profiles
Each workspace can save mapping profiles:
- "My Old Quotes Template"
- "My Website Leads Template"
- "My Vendor CSV Template"

Next time they import a similar file:
1. Choose profile
2. Confirm
3. Import

Makes SmartSend feel like it remembers how their business works.

### 7. Enhanced Duplicate Handling
- Shows counts: "112 contacts merged into existing homeowners", "38 duplicates within this file removed"
- Optional toggle: "Treat same email across multiple lists as the same homeowner" (recommended)
- Tags deduped contacts with `multi_list_lead` (high opportunity indicator)

### 8. Contractor-Friendly Results
Import Results screen shows:
- Total homeowners added: 1,284
- Already in SmartSend (updated): 112
- Bad emails skipped: 34
- Storm risk leads detected: 89
- Old quote leads detected: 56
- High-value neighborhood leads: 23

Big CTA: "Start a Campaign With This List" (one-click → preselects new list for campaign creation)

## Database Schema

### New Tables

#### `import_sessions`
Tracks import sessions with chunked processing:
- `id` (uuid)
- `workspace_id` (uuid)
- `file_name` (text)
- `total_rows` (int)
- `processed_rows` (int)
- `status` (pending/running/completed/failed/paused)
- `danger_score` (safe/caution/risky)
- `column_mapping` (jsonb)
- `cleaned_data` (jsonb)
- `import_summary` (jsonb)
- `created_at`, `updated_at`, `completed_at`

#### `import_profiles`
Saved mapping profiles per workspace:
- `id` (uuid)
- `workspace_id` (uuid)
- `name` (text)
- `source_type` (text)
- `column_mapping` (jsonb)
- `default_tags` (jsonb)
- `send_caps` (jsonb)
- `is_default` (boolean)
- `created_at`, `updated_at`

#### `import_results`
Detailed import results:
- `id` (uuid)
- `session_id` (uuid)
- `workspace_id` (uuid)
- `total_added` (int)
- `total_updated` (int)
- `bad_emails_skipped` (int)
- `duplicates_removed` (int)
- `storm_risk_leads` (int)
- `old_quote_leads` (int)
- `high_value_neighborhood_leads` (int)
- `created_at`

### Enhanced Tables

#### `contact_imports`
Added fields:
- `session_id` (uuid) - Links to import_sessions
- `profile_id` (uuid) - Links to import_profiles
- `danger_score` (text)
- `column_mapping` (jsonb)
- `cleaned_stats` (jsonb)
- `import_summary` (jsonb)

#### `contacts`
Added fields:
- `tags` (jsonb)
- `past_quote_amount` (numeric)
- `address` (text)
- `source_tags` (jsonb)

## API Routes

### POST `/api/contacts/import/upload`
Upload CSV file, get smart mappings and danger score.

**Request:**
- `file` (File)
- `source_type` (optional string)

**Response:**
```json
{
  "session_id": "uuid",
  "headers": ["email", "name", ...],
  "preview_rows": [...],
  "mappings": {"email": "email", "name": "full_name"},
  "mapping_confidence": 0.85,
  "suggestions": [...],
  "danger_score": {
    "level": "safe|caution|risky",
    "score": 2,
    "reasons": [...],
    "recommendations": [...]
  },
  "stats": {...}
}
```

### POST `/api/contacts/import/clean`
Clean CSV data before import.

**Request:**
- `session_id` (string)
- `rows` (array)
- `column_mapping` (object)

**Response:**
```json
{
  "cleaned_rows": [...],
  "stats": {
    "rows_cleaned": 1000,
    "emails_normalized": 50,
    "duplicates_merged": 5,
    ...
  }
}
```

### POST `/api/contacts/import/process`
Process import in chunks.

**Request:**
- `session_id` (string)
- `list_id` (optional string)
- `rows` (array)
- `column_mapping` (object)
- `default_tags` (optional array)
- `treat_same_email_as_same_homeowner` (optional boolean)

**Response:**
```json
{
  "success": true,
  "processed": 1000,
  "summary": {
    "total_added": 950,
    "total_updated": 50,
    "bad_emails_skipped": 20,
    "duplicates_removed": 30
  }
}
```

### POST `/api/contacts/import/resume`
Resume a paused or failed import.

**Request:**
- `session_id` (string)

**Response:**
```json
{
  "success": true,
  "session_id": "uuid",
  "resume_from": 3200,
  "total_rows": 5000
}
```

### GET `/api/contacts/import/profiles`
List all import profiles for workspace.

### POST `/api/contacts/import/profiles`
Create new import profile.

### PUT `/api/contacts/import/profiles`
Update import profile.

### DELETE `/api/contacts/import/profiles?id=...`
Delete import profile.

## Library Functions

### `lib/import/smart-column-mapping.ts`
- `generateSmartMappings()` - Generate column mappings from headers and samples
- `analyzeColumn()` - Analyze single column
- `applyPresetMapping()` - Apply preset mappings
- `getDefaultTagsForSource()` - Get default tags
- `getSendCapsForSource()` - Get recommended send caps

### `lib/import/data-cleanup.ts`
- `cleanRow()` - Clean single row
- `cleanRows()` - Clean array of rows
- `isGarbageRow()` - Detect garbage rows

### `lib/import/danger-score.ts`
- `calculateDangerScore()` - Calculate danger level
- `detectBoughtList()` - Detect if list looks purchased
- `calculateImportStats()` - Calculate statistics

## Implementation Status

✅ Database migration created
✅ Smart column mapping logic
✅ Import presets system
✅ One-click clean-up functionality
✅ Danger score calculation
✅ Chunked processing API
✅ Resume capability API
✅ Import profiles API
⏳ UI components (to be implemented)
⏳ Import results page (to be implemented)

## Next Steps

1. Build UI components for import flow
2. Create import results page with contractor-friendly labels
3. Add "Start Campaign" CTA on results page
4. Test end-to-end import flow
5. Add error handling and edge cases

## Benefits for Roofing Companies

- **Dump ANY spreadsheet** without stress
- **SmartSend makes bad data usable**, not painful
- **Avoid burning email domain** on trash lists
- **Office staff saves HOURS** cleaning CSVs manually
- **Natural workflow** to bring every old quote, storm list, vendor file, website form into SmartSend
- **More data → more targeted campaigns → more booked estimates**





















































