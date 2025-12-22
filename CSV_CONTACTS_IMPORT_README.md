# CSV Contacts Import Implementation

This implementation adds a polished CSV importer that maps columns, auto de-dupes, honors suppression lists, and commits only clean contacts—so your send pool grows safely and efficiently.

## Features

- **Drag & Drop CSV Upload**: Easy file selection with visual feedback
- **Smart Column Mapping**: Auto-detects common field names (email, first_name, etc.)
- **Email Validation**: Filters out invalid email addresses
- **Duplicate Detection**: Removes duplicates within the file (keeps first occurrence)
- **Suppression List Integration**: Skips emails in your suppression list
- **Existing Contact Updates**: Updates existing contacts only if fields changed
- **Preview Before Import**: Shows detailed statistics before committing
- **Batch Processing**: Efficiently handles large CSV files

## Files Created

### Frontend
- `app/contacts/import/page.tsx` - Main import page with drag & drop interface

### API Routes
- `app/api/contacts/import/preview/route.ts` - Preview processing and validation
- `app/api/contacts/import/commit/route.ts` - Commit the import to database

### Database
- `contacts-import-schema.sql` - Database tables and RLS policies
- `test-contacts.csv` - Sample CSV for testing

## Setup Instructions

### 1. Install Dependencies
The required dependencies are already installed:
- `papaparse` - CSV parsing
- `@supabase/supabase-js` - Database client

### 2. Environment Variables
Ensure these are set in your `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Database Setup
Run the SQL in `contacts-import-schema.sql` in your Supabase SQL editor:

```sql
-- Contacts table
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Suppressions list
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  reason text,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists contacts_email_idx on contacts (email);
create index if not exists suppressions_email_idx on suppressions (email);

-- RLS policies
alter table contacts enable row level security;
alter table suppressions enable row level security;

create policy "contacts read" on contacts for select to anon, authenticated using (true);
create policy "contacts insert (service)" on contacts for insert to service_role with check (true);
create policy "contacts update (service)" on contacts for update to service_role using (true) with check (true);
create policy "suppressions read" on suppressions for select to anon, authenticated using (true);
create policy "suppressions write (service)" on suppressions for insert to service_role with check (true);
```

### 4. Test the Implementation

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to: `http://localhost:3000/contacts/import`

3. Test with the sample CSV:
   - Drag `test-contacts.csv` onto the page
   - Check auto-mapping (should detect Email → email, First Name → first_name, etc.)
   - Click "Preview De-dupe" to see statistics:
     - Total: 5 rows
     - Invalid: 1 (bademail)
     - Dupes: 1 (prospect2@example.com appears twice)
     - Suppressed: 0 (unless you add blocked@example.com to suppressions)
     - To Insert: 3 unique valid emails
     - To Update: 0 (first import)

4. Click "Commit Import" to import the contacts

### 5. Optional: Test Suppression
Add a suppression to test the feature:
```sql
insert into suppressions (email, reason) values ('blocked@example.com','hard bounce');
```

## How It Works

### 1. File Upload & Parsing
- Uses Papa Parse to handle CSV files
- Supports drag & drop and file picker
- Auto-detects headers and parses data

### 2. Column Mapping
- Smart auto-mapping based on common field names:
  - "email" → email
  - "first name", "first" → first_name
  - "last name", "last" → last_name
  - "company", "org" → company
  - "title", "role" → title
  - "phone", "mobile" → phone
- Manual mapping available for custom field names

### 3. Preview Processing
The preview API performs several validation steps:

1. **Email Validation**: Filters out invalid email addresses
2. **Duplicate Detection**: Identifies duplicates within the file
3. **Suppression Check**: Queries suppression list to skip blocked emails
4. **Existing Contact Check**: Finds contacts already in database
5. **Change Detection**: Determines if existing contacts need updates

### 4. Import Statistics
The preview shows:
- **Total Rows**: Total rows in CSV
- **Invalid Email**: Rows with invalid email addresses
- **Dupes in File**: Duplicate emails within the file
- **Suppressed**: Emails in suppression list
- **Existing Contacts**: Contacts already in database
- **To Insert**: New contacts to be added
- **To Update**: Existing contacts with changed data
- **Ready to Send**: Final count of contacts ready for campaigns

### 5. Commit Process
- Inserts new contacts in batch
- Updates existing contacts individually
- Skips invalid, duplicate, and suppressed emails
- Returns summary of operations performed

## Acceptance Criteria

✅ **Invalid emails are excluded** from insert/update operations
✅ **Duplicate emails in the file** are collapsed (keeps first occurrence)
✅ **Suppressed emails are skipped** based on suppression list
✅ **Existing contacts are updated** only if fields changed
✅ **Ready to Send** equals To Insert on first import, then drops on re-import since they become existing
✅ **Auto-mapping** intelligently detects common field names
✅ **Preview functionality** shows detailed statistics before import
✅ **Error handling** provides clear feedback for failures
✅ **Batch processing** efficiently handles large CSV files

## Security Features

- **Row Level Security (RLS)** enabled on all tables
- **Service role** used only for write operations
- **Input validation** on all API endpoints
- **Email normalization** (lowercase, trimmed)
- **SQL injection protection** via parameterized queries

## Performance Considerations

- **Batch inserts** for new contacts
- **Individual updates** for existing contacts (to handle conflicts)
- **Indexed email fields** for fast lookups
- **Efficient duplicate detection** using Map data structure
- **Minimal database queries** by batching operations

## Future Enhancements

- **Progress indicators** for large file processing
- **CSV template download** with sample data
- **Import history** and rollback functionality
- **Custom field mapping** presets
- **Bulk suppression** management
- **Import scheduling** for large files