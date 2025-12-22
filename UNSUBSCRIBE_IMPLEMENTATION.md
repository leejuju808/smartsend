# Unsubscribe System Implementation

## Overview
Token-based unsubscribe system for leads that:
- Generates unique tokens for each lead
- Stops sequence enrollments automatically
- Blocks future sends to unsubscribed leads
- Provides clean landing page for users

## Files Created/Modified

### 1. SQL Migration
**File**: `supabase/migrations/20250201_lead_unsubscribe_system.sql

**Tables Created:**
- `unsubscribe_tokens` - Stores unique tokens for leads
- `unsubscribes` - Audit log of unsubscribe events
- Adds `unsubscribed_at` column to `leads` table

**Triggers:**
- `stop_enrollments_on_unsub()` - Automatically stops all active sequence enrollments when a lead unsubscribes

### 2. Helper Functions
**File**: `src/lib/unsubscribe.ts`

Provides utility functions:
- `getOrCreateUnsubToken()` - Gets or creates a token for a lead
- `unsubUrlFromToken()` - Generates the unsubscribe URL

### 3. Unsubscribe Landing Page
**Files**: 
- `src/app/u/[token]/page.tsx` - Main unsubscribe page
- `src/app/u/[token]/loading.tsx` - Loading state

Processes unsubscribes:
- Validates token
- Records unsubscribe event with user agent and IP
- Marks lead as unsubscribed
- Shows confirmation message

### 4. Queue Dispatcher Updates
**File**: `supabase/functions/queue-dispatcher/index.ts`

**Changes:**
1. **API Guard (lines 415-435)**: Checks if lead has unsubscribed_at timestamp and blocks sending
2. **Unsubscribe Footer Injection (lines 545-581)**: 
   - Gets or creates unsubscribe token for lead
   - Injects unsubscribe footer into email HTML
   - Footer includes link to `/u/[token]` route

## How It Works

### Email Flow
1. Queue dispatcher processes a job for a lead
2. Checks if lead has `unsubscribed_at` - if yes, cancels job
3. If sending, retrieves or creates unsubscribe token
4. Injects unsubscribe footer into email HTML
5. Sends email with footer included

### Unsubscribe Flow
1. User clicks unsubscribe link in email footer
2. Lands on `/u/[token]` page
3. Token is validated against `unsubscribe_tokens` table
4. System inserts record into `unsubscribes` table (with IP/UA)
5. Updates `leads.unsubscribed_at` timestamp
6. Trigger automatically stops all active sequence enrollments
7. Shows confirmation message

## Testing

### Run SQL Migration
```sql
-- Run in Supabase SQL Editor
\i supabase/migrations/20250201_lead_unsubscribe_system.sql
```

### Test Unsubscribe
1. Create a test lead and send an email
2. Click unsubscribe link in email footer
3. Should redirect to `/u/[token]` and show confirmation
4. Check `unsubscribes` table for audit record
5. Verify `leads.unsubscribed_at` is set
6. Verify sequence enrollments are stopped

### Test API Guard
1. Send email to unsubscribed lead
2. Check that job status is "canceled" with error "unsubscribed"
3. Verify no email is sent

## Optional Enhancements

### UI Updates
Add unsubscribe badge to leads table:
```tsx
{lead.unsubscribed_at ? (
  <Badge className="bg-red-600/20 text-red-300">Unsubscribed</Badge>
) : null}
```

### Analytics
Query unsubscribe stats:
```sql
SELECT campaign_id, count(*) as unsubscribes
FROM unsubscribes
GROUP BY campaign_id;
```

### Deliverability Headers
Add to email provider calls:
```typescript
headers: {
  "List-Unsubscribe": `<${unsubscribe_url}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
}
```
