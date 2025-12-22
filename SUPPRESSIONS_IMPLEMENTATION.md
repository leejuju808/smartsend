# Suppressions UI Implementation

Complete Suppressions UI with CSV helper and optional SQL RPC for fast bulk inserts (better for 1–5k rows).

## Files Created

1. **`/app/dashboard/suppressions/page.tsx`** - Main suppressions page component
2. **`/lib/csv/importSuppressions.ts`** - CSV import helper with bulk import functionality
3. **`/supabase/sql/bulk_insert_suppressions.sql`** - Optional RPC for fast bulk inserts
4. **`/fixtures/suppressions_test.csv`** - Test CSV file for testing

## Features

- **Manual Email Addition**: Add single emails with optional reason/source
- **CSV Upload**: Bulk import with header mapping and auto-detection
- **Smart Deduplication**: In-file deduplication + database-level uniqueness
- **Fast Bulk Import**: Optional RPC function for 1-5k row imports
- **RLS Security**: Row-level security ensures users only see their suppressions
- **Email Normalization**: Automatic email standardization (lowercase, trim)

## Setup Instructions

### 1. Install Dependencies
```bash
npm i papaparse @supabase/supabase-js
```
*Note: Already installed in your project*

### 2. Add Files
The files have been created exactly as specified in your request.

### 3. Optional: Add RPC for Fast Bulk Inserts
Open Supabase Dashboard → SQL → New query, paste the entire contents of:
```
/supabase/sql/bulk_insert_suppressions.sql
```
Run it to create the `bulk_insert_suppressions` function.

### 4. Development & Testing
```bash
npm run dev
# Visit /dashboard/suppressions
# Ensure you are signed in (RLS requires session)
```

## Testing Checklist

### Manual Add
- [ ] Add `BOUNCE@Example.com` with reason "bounced", source "manual"
- [ ] Verify it appears lowercased as `bounce@example.com`
- [ ] Check duplicate protection by trying to add `bounce@example.com` again
- [ ] UI should show friendly duplicate notice (no crash)

### CSV Import
- [ ] Use the test file: `fixtures/suppressions_test.csv`
- [ ] Upload, map headers, Import
- [ ] Expected results:
  - **Attempted**: 4
  - **Imported**: 3 (if `bounce@example.com` already added manually)
  - **Duplicates in file**: 1 (`spam@foo.com` repeated)

### Delete Functionality
- [ ] Click Delete on one row
- [ ] Row disappears and does not return on Refresh

### Safety Features
- [ ] RLS ensures users can only see/edit their rows
- [ ] Email normalization + unique index prevents casing issues
- [ ] Leading/trailing whitespace is handled properly

## Database Schema

The implementation uses the `suppressions_v2` table with the following structure:

```sql
create table public.suppressions_v2 (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  reason text,                         -- optional: "bounced", "unsubscribed", "complaint", etc.
  source text,                         -- optional: "import", "manual", "system"
  created_at timestamptz not null default now(),
  constraint suppressions_v2_email_not_blank check (length(trim(coalesce(email,''))) > 0)
);
```

## RPC Function (Optional)

The `bulk_insert_suppressions` RPC function provides:
- Fast bulk inserts for 1-5k rows
- Automatic deduplication
- Email normalization
- Conflict resolution with `ON CONFLICT DO NOTHING`

## Error Handling

- **Authentication**: Clear warning if user not signed in
- **Duplicate Emails**: Friendly message for existing suppressions
- **CSV Parsing**: Clear error messages for malformed files
- **Import Errors**: Detailed summary with error counts and messages

## Performance Notes

- **Small imports (<100 rows)**: Use standard one-by-one inserts
- **Large imports (100-5k rows)**: Use RPC function for better performance
- **Very large imports (>5k rows)**: Consider chunking or background processing

## Security Features

- **Row Level Security (RLS)**: Users can only access their own suppressions
- **Input Validation**: Email normalization and validation
- **SQL Injection Protection**: Uses Supabase parameterized queries
- **Authentication Required**: All operations require valid session

## Troubleshooting

### Common Issues

1. **"You must be signed in" warning**
   - Ensure user is authenticated
   - Check Supabase auth configuration

2. **CSV parsing errors**
   - Verify CSV format (comma-separated, proper headers)
   - Check file encoding (UTF-8 recommended)

3. **Import failures**
   - Check RPC function exists (if using bulk import)
   - Verify database permissions and RLS policies

4. **Performance issues with large imports**
   - Ensure RPC function is created
   - Consider chunking very large files

### Debug Mode

Add console logs to the CSV parsing functions to debug import issues:

```typescript
console.log('CSV Headers:', csvHeaders);
console.log('Mapped Data:', mapped);
console.log('Unique Emails:', unique);
```

## Future Enhancements

- **Batch Processing**: Background job processing for very large imports
- **Import Templates**: Predefined CSV templates for common use cases
- **Export Functionality**: Download current suppressions as CSV
- **Audit Logging**: Track all suppression changes
- **Bulk Operations**: Select multiple suppressions for batch delete/update 