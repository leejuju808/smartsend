# CSV Lead Import Feature

This feature enables you to import leads from CSV files with drag-drop functionality, column mapping, validation, and automatic upsert.

## Components

### 1. Database Schema (`supabase/migrations/20250126_create_leads_import_schema.sql`)

The leads table includes the following columns:

- `id` - UUID primary key
- `user_id` - UUID reference to the user importing the leads
- `campaign_id` - Optional UUID reference to a campaign
- `email` - Required, unique per user
- `first_name` - Optional
- `last_name` - Optional  
- `company` - Optional
- `title` - Optional
- `phone` - Optional
- `custom` - JSONB field for unmapped columns
- `status` - Default 'new', can be: new, queued, replied, unsubscribed, bounced
- `reply_detected` - Boolean flag for replies
- `reply_summary` - Text summary of replies
- `created_at` - Timestamp
- `updated_at` - Timestamp

### 2. API Route (`src/app/api/leads/import/route.ts`)

**Endpoint:** `POST /api/leads/import`

**Request Body:**
```json
{
  "rows": [...],           // Array of parsed CSV rows
  "mapping": {             // Column mapping object
    "email": "Email",
    "first_name": "First Name",
    // ... other fields
  },
  "campaignId": "...",     // Optional
  "userId": "..."          // Required
}
```

**Response:**
```json
{
  "ok": true,
  "inserted": 150,
  "invalid": 10,
  "invalid_samples": [...]  // First 10 invalid records
}
```

**Validation:**
- Email addresses are validated using regex
- Invalid emails are skipped and returned in the response
- Unmapped columns are stored in the `custom` JSONB field

### 3. React Component (`src/components/LeadCSVImporter.tsx`)

Features:
- Drag and drop CSV file upload
- Automatic column mapping based on header names
- Manual column mapping interface
- Preview of first 5 rows before import
- Import results with validation summary
- Invalid email samples shown

**Required Props:**
- `userId` - The current user's ID
- `campaignId` - Optional campaign ID to associate leads with

### 4. Page (`src/app/leads/import/page.tsx`)

A simple page that wraps the LeadCSVImporter component with authentication.

## Setup Instructions

### 1. Apply Database Migration

Run the migration in your Supabase SQL editor:

```bash
# Via Supabase CLI
supabase db push

# Or apply the SQL directly in Supabase Dashboard
# Open SQL Editor and paste the contents of:
# supabase/migrations/20250126_create_leads_import_schema.sql
```

### 2. Install Dependencies

The required dependencies are already in package.json:
- `papaparse` - CSV parsing
- `@supabase/supabase-js` - Database client

If not installed:
```bash
npm install papaparse
```

### 3. Environment Variables

Ensure these are set in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Access the Import Page

Navigate to `/leads/import` in your application.

## Usage

1. **Upload CSV**: Drag and drop or click to browse for a CSV file
2. **Auto-mapping**: The system automatically maps common column names (email, first name, last name, etc.)
3. **Manual mapping**: Adjust column mappings using the dropdowns
4. **Preview**: Review the first 5 rows of data
5. **Import**: Click "Import Leads" to validate and upload
6. **Results**: See how many leads were inserted and which emails were invalid

## CSV Format

Your CSV file should have headers and at least an email column:

```csv
Email,First Name,Last Name,Company,Title,Phone
john@example.com,John,Doe,Acme Corp,CEO,+1-555-0100
jane@example.com,Jane,Smith,Tech Inc,CTO,
```

Any unmapped columns will be stored in the `custom` JSONB field.

## Example CSV

```csv
Email,First Name,Last Name,Company,Title,Phone,Custom Field
john@example.com,John,Doe,Acme Corp,CEO,+1-555-0100,Some Value
jane@example.com,Jane,Smith,Tech Inc,CTO,,Another Value
```

In this example:
- Email, First Name, Last Name, Company, Title, Phone → Mapped to standard fields
- Custom Field → Stored in the `custom` JSONB field

## Features

- ✅ Email validation
- ✅ Automatic column detection
- ✅ Manual column mapping
- ✅ Data preview
- ✅ Upsert by email (won't create duplicates)
- ✅ Invalid email reporting
- ✅ Custom field storage
- ✅ Campaign association
- ✅ Responsive UI

## Troubleshooting

### "No rows or email mapping missing"
- Ensure your CSV has headers
- Make sure you've mapped at least the email column

### "Invalid email" errors
- Check that email addresses are valid format
- Ensure there are no extra spaces
- Common issues: missing @, no domain, invalid TLD

### Import shows 0 inserted
- Check that at least one valid email exists
- Verify the mapping is correct
- Check browser console for errors