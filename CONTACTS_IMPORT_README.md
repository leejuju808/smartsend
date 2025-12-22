# Contact Import Feature

Production-ready CSV contact import system with column mapping, deduplication, and automatic suppression list checking.

## 🎯 What This Does

This feature enables safe, clean contact list imports that:
- ✅ Parse CSV files with flexible column mapping
- ✅ Automatically deduplicate contacts within the file and against existing records
- ✅ Skip any emails on your suppression list (bounced, unsubscribed, etc.)
- ✅ Normalize emails (lowercase, trim whitespace)
- ✅ Track import stats (inserted, updated, skipped)

## 📁 Files Created

```
src/
├── app/
│   ├── contacts/
│   │   └── import/
│   │       └── page.tsx              # CSV upload + mapping UI
│   └── api/
│       ├── contacts/
│       │   └── import/
│       │       └── route.ts          # CSV parsing + import logic
│       └── suppressions/
│           └── route.ts              # Suppression list management
└── supabase/
    └── migrations/
        └── contacts_suppressions_schema.sql  # Database schema
```

## 🚀 Setup Instructions

### 1. Install Dependencies

The required `csv-parse` package is already installed in your package.json.

### 2. Apply Database Schema

Open your Supabase SQL Editor and run the migration file:

```bash
# Copy the contents of supabase/migrations/contacts_suppressions_schema.sql
# Paste and execute in: Supabase Dashboard → SQL Editor
```

This creates:
- `contacts` table with unique `email_norm` constraint
- `suppressions` table for email suppression list
- Indexes for fast lookups
- Auto-update trigger for `updated_at` timestamp

### 3. Environment Variables

Ensure these are set in your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Start Development Server

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

## 📖 Usage

### Importing Contacts

1. Navigate to `/contacts/import`
2. Upload a CSV file (must have at least an Email column)
3. Map CSV columns to contact fields:
   - **Email** (required) - automatically skips invalid/suppressed emails
   - First Name
   - Last Name
   - Company
   - Title
   - Phone
   - Notes
4. Preview the first 20 rows
5. Click "Import"
6. View import statistics:
   - New contacts inserted
   - Existing contacts updated
   - Duplicates skipped (within file)
   - Suppressed emails skipped

### Auto-mapping

The UI automatically detects common column names:
- Email: `email`, `e-mail`
- First Name: `first_name`, `first name`, `firstname`, `given`, `fname`
- Last Name: `last_name`, `last name`, `lastname`, `surname`, `lname`
- Company: `company`, `organization`, `org`
- Title: `title`, `job title`, `role`
- Phone: `phone`, `phone number`, `mobile`
- Notes: `notes`, `note`

### Managing Suppressions

#### Add to Suppression List

```javascript
const response = await fetch('/api/suppressions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'bounced@example.com',
    reason: 'hard_bounce'
  })
});
```

#### Get Suppression List

```javascript
const response = await fetch('/api/suppressions');
const { data } = await response.json();
```

#### Remove from Suppression List

```javascript
const response = await fetch('/api/suppressions?email=bounced@example.com', {
  method: 'DELETE'
});
```

## 🔒 How Suppression Works

1. **Import-time Check**: Before inserting any contact, the system loads all suppressed emails into memory
2. **Normalized Comparison**: Emails are lowercased and trimmed for accurate matching
3. **Automatic Skip**: Any email found in the suppression list is automatically skipped
4. **Stat Tracking**: Import results show exactly how many emails were suppressed

## 🎨 Key Features

### Email Normalization
- Converts to lowercase
- Trims whitespace
- Rejects invalid formats (missing @, noreply@, etc.)

### Deduplication Strategy
1. **Within-file dedup**: Tracks emails in a Set during processing
2. **Database dedup**: Upserts on unique `email_norm` constraint
3. **Update detection**: Differentiates new vs. updated contacts via timestamp comparison

### Chunked Processing
- Processes 500 rows at a time to avoid payload limits
- Efficient for large imports (10k+ contacts)

### Smart Upsert
- New contacts → inserted with `created_at` = `updated_at`
- Existing contacts → updated with new `updated_at`
- Auto-trigger maintains timestamp integrity

## 🧪 Testing

### Sample CSV

Create `test_contacts.csv`:

```csv
Email,First Name,Last Name,Company,Title
john@example.com,John,Doe,Acme Corp,CEO
jane@example.com,Jane,Smith,TechCo,CTO
john@example.com,John,Doe,Acme Corp,CEO
```

### Test Flow

1. Upload the CSV
2. Map columns (Email should auto-map)
3. Import
4. Verify results:
   - 2 contacts inserted (john and jane)
   - 1 duplicate skipped (second john)
5. Re-import the same file
6. Verify:
   - 0 new contacts
   - 2 updated contacts
   - 1 duplicate skipped

### Test Suppression

```sql
-- Add to suppression list
INSERT INTO public.suppressions (email, email_norm, reason)
VALUES ('john@example.com', 'john@example.com', 'test');
```

Now import again:
- 1 contact inserted (jane)
- 1 suppressed skipped (john)

## 🏗️ Architecture

### Frontend (`page.tsx`)
- Three-step wizard: Upload → Map → Result
- Client-side form handling
- Auto-mapping heuristics
- Preview table with all columns

### Backend (`route.ts`)
- Node.js runtime for file system access
- CSV parsing with `csv-parse`
- Chunked batch processing
- Suppression check before insert
- Stats tracking and differentiation

### Database
- Generated columns for normalized emails
- Unique constraints prevent duplicates
- Indexes optimize lookups
- Triggers maintain data integrity

## 🚨 Error Handling

- Invalid CSV → shows error message
- Missing email column → prevents import
- Database errors → returns 500 with message
- Malformed emails → skipped silently (tracked in stats)

## 🔮 Future Enhancements

- [ ] Add workspace/user ownership (RLS policies commented in schema)
- [ ] Bulk suppression import
- [ ] Custom field mapping (beyond the 7 standard fields)
- [ ] Import history tracking
- [ ] Duplicate merging strategies
- [ ] CSV export
- [ ] Background job processing for large files (>10k rows)

## 💡 Why This Matters

**Directly increases safe sending:**
- Bigger, cleaner lists → more replies → more meetings
- Eliminates list drama (dedupe + suppression prevents bounces/angry replies)
- Sets foundation for Send Safety features (ramp + bounce guard)

**Production-ready from day one:**
- Handles edge cases (malformed emails, duplicates, large files)
- Performant chunked processing
- Clear user feedback and stats
- Database constraints prevent data quality issues

---

## 🆘 Troubleshooting

### Import fails with "email_norm already exists"
This means the unique constraint is working! The contact already exists. This shouldn't happen with proper upsert logic, but if it does, check that `onConflict: "email_norm"` is specified in the upsert call.

### CSV parsing fails
- Ensure the file is valid CSV format
- Check for unescaped quotes or commas within fields
- Try exporting from Excel as "CSV UTF-8"

### Suppression not working
- Verify suppressions table has data: `SELECT * FROM public.suppressions;`
- Check email normalization: suppression list uses lowercase emails
- Ensure the API can read from suppressions table (RLS policies if enabled)

---

Built with ❤️ for SmartSend AI
