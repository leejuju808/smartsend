# Block 260 — Bulk Importer v3 Implementation

## Overview
This implementation adds advanced CSV import features including auto-detection, quality scoring, error repair suggestions, and source-aware templates.

## Database Migrations

### 1. `275_import_mapping_templates.sql`
Creates the `import_mapping_templates` table to store source-aware mapping templates (Apollo, Clay, LinkedIn, etc.).

**Features:**
- Stores template name, header signature, and mapping configuration
- Workspace-scoped with RLS policies
- GIN index on `header_signature` for fast template matching

### 2. `276_import_errors_suggestions.sql`
Extends `import_errors` table with:
- `suggestion` (jsonb) - Repair suggestions for errors
- `fixed_pending` (boolean) - Tracks if error has been fixed but not yet re-imported

## Utility Libraries

### 1. `lib/import/autoDetect.ts`
Smart column type detection based on headers and sample values.

**Features:**
- Detects: email, first_name, last_name, company, title, website, linkedin_url, phone
- Confidence levels: high, medium, low
- Value pattern matching for better accuracy

**Usage:**
```typescript
import { autoDetectMapping } from "@/lib/import/autoDetect";
const mapping = autoDetectMapping(headers, sampleRows);
```

### 2. `lib/import/qualityScore.ts`
Calculates import quality scores and generates warnings.

**Features:**
- Quality score calculation (0-100)
- Grade classification: Clean (80-100), Needs Attention (50-79), Risky (<50)
- Metrics tracking: valid emails, duplicates, invalid formats, etc.

**Usage:**
```typescript
import { calculateQualityScore } from "@/lib/import/qualityScore";
const score = calculateQualityScore(metrics);
```

### 3. `lib/import/errorRepair.ts`
Generates repair suggestions for common import errors.

**Features:**
- Email repair: trim whitespace, lowercase, strip protocol, append default user
- Website repair: strip protocol, trim whitespace
- Phone repair: trim whitespace
- Generic field repair based on error message

**Usage:**
```typescript
import { suggestRepair } from "@/lib/import/errorRepair";
const suggestion = suggestRepair("email", " JOHN@ACME.COM ", "Invalid email format");
```

### 4. `lib/import/templateMatching.ts`
Matches CSV headers to known import templates using Jaccard similarity.

**Features:**
- Pre-defined templates: Apollo, Clay, LinkedIn CSV, HubSpot, Salesforce
- Jaccard similarity calculation (70% threshold for match)
- Header signature normalization

**Usage:**
```typescript
import { findBestTemplate } from "@/lib/import/templateMatching";
const match = findBestTemplate(headers);
```

## API Endpoints

### 1. `POST /api/import/analyze`
Analyzes CSV file before import.

**Request:**
- FormData with `file` (CSV) and `workspaceId`

**Response:**
```json
{
  "headers": ["Email", "First Name", ...],
  "sampleRows": [...],
  "autoMapping": { "Email": "email", ... },
  "templateMatch": { "sourceName": "Apollo", "similarity": 0.85 },
  "workspaceTemplate": { "id": "...", "sourceName": "...", "mapping": {...} },
  "qualityScore": { "score": 75, "grade": "Needs Attention", ... },
  "metrics": {...},
  "sampleErrors": [...],
  "suggestEnrichment": true,
  "totalRows": 1000
}
```

### 2. `GET /api/import/templates?workspaceId=...`
Lists all mapping templates for a workspace.

### 3. `POST /api/import/templates`
Creates a new mapping template.

**Request:**
```json
{
  "workspaceId": "...",
  "sourceName": "Apollo Default Export",
  "headers": ["Email", "First Name", ...],
  "mapping": { "Email": "email", ... }
}
```

### 4. `POST /api/imports/[id]/fix-errors`
Applies one-click fixes to import errors.

**Request:**
```json
{
  "errorIds": ["uuid1", "uuid2", ...]
}
```

**Response:**
```json
{
  "ok": true,
  "fixed": 5
}
```

### 5. `POST /api/imports/[id]/reimport-fixed`
Re-processes rows that were fixed via one-click fixes.

**Response:**
```json
{
  "ok": true,
  "inserted": 5,
  "stillErrors": 0
}
```

### 6. Updated `POST /api/import`
Enhanced import endpoint with:
- Error repair suggestions stored in `import_errors.suggestion`
- Extended mapping structure support:
  ```json
  {
    "columns": { "Email": "email", "First Name": "first_name" },
    "source_template": "Apollo Default Export",
    "enrich_after_import": true
  }
  ```
- Missing email validation (blocks if no email column mapped)
- Website and LinkedIn URL field support

### 7. Updated `GET /api/imports/[id]/errors`
Now includes `suggestion` and `fixed_pending` fields in response.

## Mapping Structure

The import mapping now supports two formats:

### Legacy Format (still supported):
```json
{
  "email": "Email",
  "first_name": "First Name",
  "company": "Company"
}
```

### New Extended Format:
```json
{
  "columns": {
    "Email": "email",
    "First Name": "first_name",
    "Company": "company",
    "Website": "website"
  },
  "source_template": "Apollo Default Export",
  "enrich_after_import": true
}
```

## Error Repair Suggestions

When an error is detected, a suggestion object is stored:

```json
{
  "field": "email",
  "type": "trim_and_lowercase",
  "proposed_value": "john@acme.com",
  "original_value": " JOHN@ACME.COM "
}
```

**Suggestion Types:**
- `trim_whitespace` - Remove leading/trailing spaces
- `lowercase` - Convert to lowercase
- `trim_and_lowercase` - Both operations
- `strip_protocol` - Remove http:// or https://
- `append_default_user` - Add default email prefix (e.g., "info@acme.com")
- `normalize_phone` - Clean phone number format
- `fix_domain_format` - Fix domain formatting

## Quality Scoring

Quality scores are calculated based on:
- Missing email percentage (40% weight)
- Invalid email percentage (30% weight)
- Duplicate in file percentage (15% weight)
- Duplicate in DB percentage (15% weight)
- Invalid domain percentage (5% weight)

**Grades:**
- **Clean** (80-100): Ready to import
- **Needs Attention** (50-79): Review warnings
- **Risky** (<50): Significant issues detected

## Template Matching

Templates are matched using Jaccard similarity on normalized header signatures. A match is considered when similarity >= 0.7 (70%).

**Known Templates:**
- Apollo
- Clay
- LinkedIn CSV
- HubSpot Export
- Salesforce Export

## Enrichment Suggestions

If CSV includes `website`/`domain` but lacks `company` metadata, the system suggests enabling enrichment. This is stored as `enrich_after_import: true` in the mapping, which can be checked by enrichment jobs.

## RLS Policies

All new tables and columns follow workspace-scoped RLS:
- Users can only access templates/errors for their workspace
- Access controlled via `team_members` table
- Policies check for `status = 'active'`

## Next Steps for UI Integration

1. **Upload Step**: Call `/api/import/analyze` after file upload
2. **Mapping Step**: 
   - Show auto-detected mapping
   - Offer template matches
   - Show mapping chips under headers
3. **Quality & Warnings Step**:
   - Display quality score and grade
   - Show warnings for missing emails, duplicates, etc.
   - Offer enrichment checkbox if domain present
4. **Confirmation Step**:
   - Show summary counts
   - Checkbox to exclude invalid/duplicate rows
5. **Post-Import**:
   - Show import stats
   - Display errors with "Apply Fix" buttons
   - "Re-import Fixed Rows" button

## Testing Checklist

- [ ] Auto-detection works for various CSV formats
- [ ] Template matching identifies known sources
- [ ] Quality scoring calculates correctly
- [ ] Error repair suggestions are generated
- [ ] One-click fixes update row_data correctly
- [ ] Re-import processes fixed rows
- [ ] Missing email validation blocks import
- [ ] Enrichment flag is stored correctly
- [ ] RLS policies prevent unauthorized access









