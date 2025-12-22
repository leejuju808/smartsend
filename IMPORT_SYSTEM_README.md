# CSV Import System with Deduplication & Suppression Guard

This system provides a robust CSV import functionality with built-in deduplication and suppression handling to protect sender health and improve deliverability.

## Features

- **Email Validation**: Automatically validates email addresses using RFC 5322-compliant regex
- **Deduplication**: Prevents duplicates within the same file and against existing contacts
- **Suppression Handling**: Skips emails on global or campaign-specific suppression lists
- **Batch Processing**: Handles large files efficiently with chunked inserts
- **Error Reporting**: Provides detailed statistics and sample error messages
- **Row Level Security**: Ensures users can only access their workspace data

## Database Schema

### Tables Created

1. **contacts**: Stores contact information with workspace isolation
2. **suppressions**: Global suppression list per workspace
3. **campaigns**: Campaign management
4. **campaign_suppressions**: Campaign-specific suppression lists

### Key Features

- Unique constraints prevent duplicate contacts per workspace
- Enum for suppression reasons (unsubscribed, bounced, complaint, manual, role_account, invalid_format)
- Helper function `is_suppressed()` to check suppression status
- RLS policies ensure data isolation between workspaces

## Usage

### 1. Apply Database Migration

Run the SQL migration in Supabase:
```sql
-- Apply the contents of: supabase/migrations/20250124_create_import_suppression_system.sql
```

### 2. Access the Import Interface

Visit: `http://localhost:3000/import`

### 3. Import Process

1. **Select CSV File**: Upload a CSV file with contact data
2. **Provide Workspace ID**: Enter your workspace UUID
3. **Optional Campaign ID**: Specify a campaign for campaign-specific suppression
4. **Configure Mapping**: JSON mapping of CSV columns to contact fields:

```json
{
  "email": "Email",
  "first_name": "First Name", 
  "last_name": "Last Name",
  "company": "Company",
  "title": "Title",
  "phone": "Phone",
  "custom": ["Notes", "Source"]
}
```

### 4. Import Results

The system provides detailed statistics:
- Total rows processed
- Valid contacts found
- Successfully inserted
- Skipped due to invalid emails
- Skipped due to in-file duplicates
- Skipped due to existing contacts
- Skipped due to global suppression
- Skipped due to campaign suppression

## API Endpoint

**POST** `/api/import/contacts`

**Form Data:**
- `file`: CSV file
- `workspaceId`: Workspace UUID
- `campaignId`: Campaign UUID (optional)
- `mapping`: JSON string with column mapping

**Response:**
```json
{
  "ok": true,
  "counts": {
    "total_rows": 100,
    "valid": 95,
    "inserted": 90,
    "skipped_invalid_email": 3,
    "skipped_duplicate_in_file": 2,
    "skipped_existing_contact": 5,
    "skipped_suppressed_global": 0,
    "skipped_suppressed_campaign": 0
  },
  "sample_errors": [...]
}
```

## Sample CSV

Use `fixtures/sample_contacts.csv` for testing:

```csv
Email,First Name,Last Name,Company,Title,Phone,Notes
john.doe@example.com,John,Doe,Acme Corp,CEO,+1-555-0123,Interested in enterprise plan
jane.smith@company.com,Jane,Smith,Tech Inc,CTO,+1-555-0456,Requested demo
invalid-email,Invalid,Email,TestCorp,Manager,+1-555-0987,This should be skipped
```

## Testing

Run the test suite:
```bash
npm test tests/import.test.ts
```

## Security

- Row Level Security (RLS) ensures workspace isolation
- Email validation prevents malformed addresses
- Suppression lists protect sender reputation
- Batch processing with error handling for reliability

## Dependencies

- `csv-parse`: CSV parsing (already installed)
- `@supabase/ssr`: Supabase server client
- `lucide-react`: Icons
- Next.js App Router

## Files Created/Modified

- `supabase/migrations/20250124_create_import_suppression_system.sql` - Database schema
- `src/app/api/import/contacts/route.ts` - Import API endpoint (already existed)
- `src/app/import/page.tsx` - Import UI (already existed)
- `src/components/ui/*.tsx` - UI components
- `src/lib/supabase/server.ts` - Server client utility
- `tests/import.test.ts` - Test suite
- `fixtures/sample_contacts.csv` - Sample data