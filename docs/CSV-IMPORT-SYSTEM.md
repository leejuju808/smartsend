# CSV Import System

This system allows users to import contacts from CSV files with automatic deduplication and suppression list checking.

## Features

- **CSV Import**: Upload CSV files with contact information
- **Smart Field Detection**: Automatically detects common field names (email, first_name, last_name, company)
- **Deduplication**: Removes duplicates within the same file
- **Suppression List**: Automatically skips emails in the suppression list
- **Bulk Suppression Management**: Add multiple emails to suppression list at once
- **Import Analytics**: Track import statistics and results

## Database Schema

### Tables

1. **contacts**: Stores imported contact information
   - `id`: Unique identifier
   - `user_id`: References auth.users
   - `email`: Contact email (case-insensitive)
   - `first_name`, `last_name`, `company`: Optional contact details
   - `created_at`, `updated_at`: Timestamps

2. **suppression_list**: Stores emails to exclude from imports
   - `id`: Unique identifier
   - `user_id`: References auth.users
   - `email`: Suppressed email (case-insensitive)
   - `reason`: Optional reason for suppression
   - `created_at`: Timestamp

3. **imports**: Tracks import runs for analytics
   - `id`: Unique identifier
   - `user_id`: References auth.users
   - `filename`: Original filename
   - `total_rows`: Total rows in CSV
   - `inserted`: Number of contacts inserted/updated
   - `skipped_duplicate`: Duplicates within file
   - `skipped_suppressed`: Emails in suppression list
   - `invalid`: Invalid email formats

## API Endpoints

### POST /api/import
Imports contacts from a CSV file.

**Request**: FormData with `file` field containing CSV
**Response**: Import statistics and results

### POST /api/suppression
Adds emails to the suppression list.

**Request**: JSON with `emails` (one per line) and optional `reason`
**Response**: Number of emails added

## UI Pages

### /dashboard/import
File upload interface for CSV imports with results display.

### /dashboard/suppression
Bulk email addition to suppression list.

## Usage

1. **Add emails to suppression list**:
   - Go to `/dashboard/suppression`
   - Paste emails (one per line)
   - Add optional reason
   - Submit

2. **Import contacts**:
   - Go to `/dashboard/import`
   - Upload CSV file with headers
   - System automatically processes and deduplicates
   - View import summary

## CSV Format

Required columns:
- `email`: Contact email address

Optional columns:
- `first_name`: First name
- `last_name`: Last name  
- `company`: Company name

The system automatically detects common variations of these field names.

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- Email addresses are normalized to lowercase
- Input validation and sanitization

## Testing

Use the sample file `public/test-import.csv` to test the system:

1. Add some test emails to suppression list
2. Import the CSV file
3. Verify results in database tables 