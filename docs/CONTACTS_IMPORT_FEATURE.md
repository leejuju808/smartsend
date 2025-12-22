# Contacts Import & Suppression Feature

## Overview

This feature provides a complete CSV contact import system with deduplication and suppression filtering to protect sender health and deliverability.

## Key Components

### 1. Contact Import API (`/api/import-contacts/commit`)

**Endpoint**: `POST /api/import-contacts/commit`

**Request Body**:
```json
{
  "rows": [{ "Email": "user@example.com", "First Name": "John", ... }],
  "mapping": {
    "email": "Email",
    "first_name": "First Name",
    "last_name": "Last Name",
    "company": "Company",
    "title": "Title"
  },
  "options": {
    "dedupeBy": "email" | "email+company",
    "skipSuppressed": true
  }
}
```

**Response**:
```json
{
  "inserted": 2,
  "skipped_existing": 0,
  "suppressed": 1,
  "rejected": 0,
  "sample_inserted": [...],
  "rejected_samples": [...]
}
```

**Processing Pipeline**:
1. **Normalize emails**: Convert to lowercase, validate basic format
2. **In-memory dedupe**: Remove duplicates within the import batch
3. **Suppression filtering**: Check against email and domain suppressions
4. **Existing contact check**: Skip contacts already in database
5. **Batch insert**: Insert new contacts efficiently

### 2. Contact Import UI (`/contacts/import`)

**Features**:
- Drag-and-drop CSV file upload
- Auto-detection of column mappings
- Preview of first 10 rows
- Configurable deduplication strategy:
  - By email only
  - By email + company
- Option to skip suppressed contacts
- Real-time import progress
- Detailed result summary

### 3. Contacts List Page (`/contacts`)

**Features**:
- Display all contacts with pagination (limit 100)
- Show: email, first name, last name, company, title, created date
- Link to import page
- Responsive table layout

### 4. Suppressions Management (`/suppressions`)

**Features**:
- Add email or domain suppressions
- View all suppressions with reason
- Two suppression types:
  - **Email**: Block specific email addresses
  - **Domain**: Block entire domains

**API Endpoints**:
- `GET /api/suppressions/list`: Fetch all suppressions
- `POST /api/suppressions/add`: Add new suppression

## Database Schema

### Contacts Table
```sql
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  domain text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  created_at timestamptz default now()
);
```

**Indexes**:
- `contacts_normalized_email_idx`: Unique index for deduplication
- `contacts_domain_idx`: Fast domain lookups

### Suppressions Table
```sql
create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  type suppression_type not null, -- 'email' | 'domain'
  value text not null unique,
  reason text,
  created_at timestamptz default now()
);
```

**Indexes**:
- `suppressions_value_idx`: Unique index for fast lookups
- `suppressions_type_idx`: Filter by type

## Setup Instructions

### 1. Environment Variables

Add to `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

### 2. Database Migration

Run the migration file in Supabase SQL editor:
```bash
supabase/migrations/20250110000000_create_contacts_suppressions.sql
```

Or paste the SQL directly into the Supabase Dashboard SQL editor.

### 3. Start Development Server

```bash
pnpm dev
```

### 4. Navigate to Import Page

Open: `http://localhost:3000/contacts/import`

## Testing

### Test Case 1: Basic Import

1. Use the test CSV file: `fixtures/contacts_import_test.csv`
2. Upload to `/contacts/import`
3. Map columns (should auto-detect)
4. Click "Import"
5. **Expected**: 3 contacts inserted

### Test Case 2: Domain Suppression

1. Add domain suppression:
   ```bash
   curl -X POST http://localhost:3000/api/suppressions/add \
     -H "Content-Type: application/json" \
     -d '{"type":"domain","value":"blocked.com","reason":"bounced"}'
   ```
2. Import the same CSV
3. **Expected**: 
   - Inserted: 2
   - Suppressed: 1 (bounced@blocked.com)

### Test Case 3: Duplicate Prevention

1. Import the same CSV again
2. **Expected**:
   - Inserted: 0
   - Skipped (existing): 2 (or 3 if no suppression)
   - Suppressed: 1 (if domain suppression is active)

### Test Case 4: Email Suppression

1. Add email suppression:
   ```bash
   curl -X POST http://localhost:3000/api/suppressions/add \
     -H "Content-Type: application/json" \
     -d '{"type":"email","value":"ada@example.com","reason":"unsubscribed"}'
   ```
2. Import a CSV containing `ada@example.com`
3. **Expected**: That email is excluded (suppressed count increases)

## CSV Format

### Required Columns
- **Email**: Required field for contact identification

### Optional Columns
- **First Name**: Contact's first name
- **Last Name**: Contact's last name
- **Company**: Organization name
- **Title**: Job title

### Example CSV
```csv
Email,First Name,Last Name,Company,Title
john@example.com,John,Doe,Acme Corp,CEO
jane@example.com,Jane,Smith,Tech Inc,CTO
```

### Supported Features
- Quoted fields with commas: `"Smith, Jr."`
- Escaped quotes: `"He said ""hello"""`
- CRLF and LF line endings
- Case-insensitive column matching

## Deduplication Strategies

### By Email (Default)
- Treats same email as duplicate regardless of other fields
- Use case: General contact management
- Key: `normalized_email`

### By Email + Company
- Same email at different companies = separate contacts
- Use case: Managing contacts across multiple organizations
- Key: `normalized_email::company`

## Suppression Best Practices

### When to Use Email Suppression
- User explicitly unsubscribed
- Individual requested to be removed
- Known spam trap address
- Chronic bouncer (after confirmation)

### When to Use Domain Suppression
- Entire domain is known spam trap
- Corporate domain requested blocking
- High bounce rate domain
- Competitor domains (if applicable)

### Adding Suppressions Programmatically

```typescript
// Add email suppression
await fetch('/api/suppressions/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'email',
    value: 'user@example.com',
    reason: 'unsubscribed'
  })
});

// Add domain suppression
await fetch('/api/suppressions/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'domain',
    value: 'competitor.com',
    reason: 'company policy'
  })
});
```

## Performance Considerations

### Batch Processing
- Import processes in 1000-record chunks
- Efficient bulk inserts using Supabase batch operations
- Minimizes database round trips

### Index Usage
- Unique index on `normalized_email` prevents duplicates at DB level
- Domain index speeds up suppression checks
- Suppression value index for fast filtering

### Memory Management
- In-memory deduplication before database operations
- Minimal memory footprint for large imports
- Streaming-friendly architecture (future enhancement)

## Security

### Row Level Security (RLS)
- Contacts: Authenticated users can read
- Suppressions: Authenticated users can read
- Inserts require service role (server-side only)

### Email Normalization
- All emails stored in lowercase
- Leading/trailing whitespace removed
- Basic validation (contains @, not at start/end)

## Future Enhancements

1. **Bulk CSV Upload**: Streaming for very large files (>10K rows)
2. **Multi-tenant Support**: Associate contacts with organizations
3. **Import History**: Track who imported what and when
4. **Field Validation**: Custom validation rules per field
5. **Tag Support**: Auto-tag contacts during import
6. **Merge Conflicts**: UI for handling duplicate resolution
7. **Export**: Export contacts to CSV
8. **Batch Operations**: Bulk edit, delete, tag contacts
9. **Import Scheduling**: Automated periodic imports
10. **Webhook Integration**: Import from external sources

## Why This Matters

### Deliverability Protection
- Suppression filtering prevents sending to known bad addresses
- Domain blocking protects sender reputation
- Deduplication prevents accidental duplicate sends

### Operational Efficiency
- Fast, reliable CSV import reduces manual data entry
- Auto-mapping saves time on repeat imports
- Preview mode catches errors before commit

### Compliance
- Suppression list honors unsubscribe requests
- Audit trail for contacts (created_at timestamp)
- Easy to extend for GDPR/CAN-SPAM requirements

## Troubleshooting

### Import Shows 0 Inserted
- **Cause**: All contacts already exist or are suppressed
- **Solution**: Check suppressions list and existing contacts

### "Invalid email" Rejections
- **Cause**: Email column missing @ or malformed
- **Solution**: Verify CSV data quality, check column mapping

### Slow Import (>5 seconds for 1000 rows)
- **Cause**: Network latency or database load
- **Solution**: Check Supabase connection, consider batch size tuning

### RLS Policy Errors
- **Cause**: Missing service role key or incorrect permissions
- **Solution**: Verify `SUPABASE_SERVICE_ROLE_KEY` in environment

## Related Features

- **Send Safety** (`/send-safety`): Pre-send validation using contacts
- **Analytics** (`/analytics`): Track contact engagement metrics
- **Campaigns**: Use imported contacts for email campaigns
- **Sequences**: Multi-touch sequences using contact lists

## Support

For questions or issues:
1. Check this documentation
2. Review migration SQL in `supabase/migrations/`
3. Inspect browser console for client-side errors
4. Check server logs for API errors
5. Verify environment variables are set correctly
