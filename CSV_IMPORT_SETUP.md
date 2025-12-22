# CSV Import → Dedupe → Suppression Setup

This feature allows you to upload CSV files, dedupe contacts, apply suppression rules, and import clean contacts into your database.

## What You Get

- `/contacts/import` UI to upload CSV, map columns, preview
- Server route that parses CSV, dedupes (intra-file & DB), suppresses bad/blocked emails, and upserts clean contacts
- SQL for contacts + suppressions with RLS and helpful indexes
- Clear import summary: inserted, updated, skipped (with reasons)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install csv-parse
```

### 2. Apply SQL Schema

Run the SQL migration in your Supabase SQL editor:

```bash
# Option 1: Via Supabase Dashboard
# Go to SQL Editor → paste contents of supabase/sql/003_contacts_suppressions.sql → Run

# Option 2: Via psql
psql "$SUPABASE_DB_URL" -f supabase/sql/003_contacts_suppressions.sql
```

This creates:
- `contacts` table with RLS policies
- `suppressions` table with RLS policies
- Necessary indexes for performance

### 3. Environment Variables

Ensure these are set in your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. (Optional) Add Sample Suppressions

To test the suppression feature, add some sample blocked emails/domains:

```sql
-- Replace <USER_ID> with your actual user ID
INSERT INTO public.suppressions (user_id, s_type, value, reason) 
VALUES 
  ('<USER_ID>', 'domain', 'no-reply.com', 'no reply domain'),
  ('<USER_ID>', 'email', 'blocked@bad.com', 'prior complaint'),
  ('<USER_ID>', 'pattern', '%spam%', 'spam pattern');
```

### 5. Start Development Server

```bash
npm run dev
```

### 6. Test the Import

1. Visit `http://localhost:3000/contacts/import`
2. Enter your user_id (in dev mode - in production this comes from auth session)
3. Upload a CSV file with headers in the first row

Sample CSV format:

```csv
email,first_name,last_name,company,title,phone,notes,tags
jane@acme.com,Jane,Doe,Acme,VP,555-111-2222,priority,"vip;beta"
john@example.com,John,Smith,Example Inc,Developer,555-222-3333,,"active"
blocked@bad.com,Bad,Guy,BadCo,Spammer,,,""
test@no-reply.com,Test,User,NoReply,Ops,,,""
```

4. Map the columns (email is required)
5. Click "Start Import"

### Expected Results

- Valid contacts are inserted/updated
- Duplicate emails in CSV are skipped with reason "duplicate_in_csv"
- Invalid emails are skipped with reason "invalid_email"
- Emails in suppression list are skipped with reason "suppressed_email"
- Domains in suppression list are skipped with reason "suppressed_domain"
- Pattern matches are skipped with reason "suppressed_pattern"

## Acceptance Checks

✅ Invalid or duplicate emails in CSV are skipped with clear reasons  
✅ Emails/domains in suppressions are skipped with reason  
✅ Clean contacts are upserted (re-import updates fields, not duplicates)  
✅ Results display inserted vs updated counts and a sample of affected rows

## API Endpoint

**POST** `/api/contacts/import`

**Form Data:**
- `file`: CSV file
- `user_id`: User ID (from session in production)
- `map_email`: CSV column name for email
- `map_first_name`: CSV column name for first name
- `map_last_name`: CSV column name for last name
- `map_company`: CSV column name for company
- `map_title`: CSV column name for title
- `map_phone`: CSV column name for phone
- `map_notes`: CSV column name for notes
- `map_tags`: CSV column name for tags

**Response:**
```json
{
  "total_rows": 10,
  "accepted": 8,
  "inserted": 5,
  "updated": 3,
  "skipped": [
    {"row": {"email": "bad@email"}, "reason": "invalid_email"},
    {"row": {"email": "blocked@bad.com"}, "reason": "suppressed_email"}
  ],
  "sample": [
    {"email": "jane@acme.com", "company": "Acme"}
  ]
}
```

## Sample CSV Files

Sample CSV files are available in the `/fixtures` directory:
- `contacts_import_test.csv`
- `sample_contacts.csv`
- `contacts_edge_cases.csv`

## Production Considerations

1. **Authentication**: Replace the `user_id` form field with session-based authentication
2. **File Size Limits**: Consider adding file size validation (currently unlimited)
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **Background Processing**: For very large files (>10k rows), consider using a background job
5. **Validation**: Add more sophisticated email validation if needed
6. **Error Reporting**: Consider more detailed error reporting for production use

## Database Schema

### contacts Table
- `id`: UUID (primary key)
- `user_id`: UUID (foreign key to users)
- `email`: citext (case-insensitive)
- `first_name`, `last_name`, `company`, `title`, `phone`, `notes`: text
- `tags`: text array
- `created_at`, `updated_at`: timestamptz

### suppressions Table
- `id`: UUID (primary key)
- `user_id`: UUID (foreign key to users)
- `s_type`: enum ('email', 'domain', 'pattern')
- `value`: text (email address, domain, or LIKE pattern)
- `reason`: text
- `created_at`: timestamptz

## Troubleshooting

### CSV Not Parsing
- Ensure first row contains headers
- Check file encoding (should be UTF-8)
- Verify comma-delimited format

### No Contacts Imported
- Check that email column is mapped correctly
- Verify emails are valid format
- Check suppression list for blocked entries

### Contacts Not Visible
- Verify RLS policies are set correctly
- Ensure `user_id` matches authenticated user
- Check browser console for errors
