# Contacts and Suppression List Implementation

This document describes the implementation of the contacts management and suppression list system for SmartSend.

## Database Setup

### 1. Run SQL in Supabase

Execute the following SQL in your Supabase SQL editor:

```sql
-- 1) Contacts table
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                      -- owner (from your auth.users.id)
  email text not null,
  first_name text,
  last_name text,
  company text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enforce uniqueness per user
create unique index if not exists contacts_user_email_unique
on public.contacts (user_id, lower(email));

-- 2) Suppression (global per user: don't email these)
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  reason text,                    -- e.g. "unsubscribed", "bounced", "complaint"
  created_at timestamptz default now()
);

create unique index if not exists suppression_user_email_unique
on public.suppression_list (user_id, lower(email));

-- 3) RLS (optional – if you're using RLS)
alter table public.contacts enable row level security;
alter table public.suppression_list enable row level security;

create policy if not exists "contacts_owner_rw"
on public.contacts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "suppression_owner_rw"
on public.suppression_list
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4) updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch
before update on public.contacts
for each row execute function public.touch_updated_at();
```

## Features Implemented

### 1. Contacts Import API (`/api/contacts/import`)
- Accepts JSON payload with array of contact objects
- Server-side deduplication by email
- Filters out suppressed emails
- Chunked upserts to handle large imports
- Returns import summary with counts

### 2. Contacts Import Page (`/dashboard/contacts/import`)
- CSV file upload with preview
- Client-side deduplication
- Shows first 50 contacts as preview
- CSV template download available
- Real-time import status

### 3. Suppression List Management (`/dashboard/contacts/suppression`)
- Add emails to suppression list
- Optional reason field
- View all suppressed emails
- Simple, clean interface

### 4. Contacts List Page (`/dashboard/contacts`)
- View all contacts in table format
- Shows first_name, last_name, email, company
- Navigation to import and suppression pages
- Pro feature gating

### 5. Navigation Integration
- Added "Contacts" link to dashboard sidebar
- Mobile and desktop navigation support
- Consistent with existing design

## API Endpoints

### POST `/api/contacts/import`
**Request Body:**
```json
{
  "rows": [
    {
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company": "Acme Corp"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "received": 1,
  "unique": 1,
  "suppressed_skipped": 0,
  "upserted": 1
}
```

### GET `/api/contacts/suppression`
**Response:**
```json
{
  "rows": [
    {
      "email": "unsub@example.com",
      "reason": "unsubscribed"
    }
  ]
}
```

### POST `/api/contacts/suppression`
**Request Body:**
```json
{
  "email": "bounce@example.com",
  "reason": "bounced"
}
```

## CSV Format

Expected CSV headers: `email,first_name,last_name,company`

Example:
```csv
email,first_name,last_name,company
john.doe@example.com,John,Doe,Acme Corp
jane.smith@example.com,Jane,Smith,Tech Solutions
```

## Usage Flow

1. **Setup**: Run the SQL script in Supabase
2. **Import**: Upload CSV file via `/dashboard/contacts/import`
3. **Manage**: View contacts at `/dashboard/contacts`
4. **Suppress**: Add emails to suppression list at `/dashboard/contacts/suppression`
5. **Verify**: Re-import CSV to confirm suppressed emails are skipped

## Security Features

- Row Level Security (RLS) enabled
- User isolation (users can only see their own contacts)
- Email normalization and validation
- Duplicate prevention per user

## Performance Considerations

- Chunked imports (500 records per batch)
- Database indexes on user_id and email
- Client-side deduplication reduces server load
- Efficient suppression filtering

## Future Enhancements

- Bulk suppression operations
- Import history and rollback
- Contact tags and segmentation
- Export functionality
- Integration with email campaigns 