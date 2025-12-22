# Email Tracking Dashboard

## Overview

The Email Tracking Dashboard provides real-time campaign statistics with Supabase real-time updates. It shows the count of sent, opened, and replied emails, updating automatically as new events occur.

## Features

- **Real-time Updates**: Automatically updates when email status changes in the database
- **Three Key Metrics**:
  - **Sent**: Total number of emails sent
  - **Opened**: Emails that have been opened
  - **Replied**: Emails that have received replies
- **Modern UI**: Dark theme with yellow accent colors and hover effects

## Access

Navigate to: `/dashboard/email-tracking`

## Implementation Details

### File Location
- `src/app/dashboard/email-tracking/page.tsx`

### Key Components

1. **Real-time Subscription**: Subscribes to changes on the `email_logs` table using Supabase Realtime
2. **Stats Calculation**: 
   - Sent: Count of all records in `email_logs`
   - Opened: Records where `status = 'opened'` OR `opened = true`
   - Replied: Records where `status = 'replied'` OR `replied_at IS NOT NULL`

### Database Schema

The dashboard relies on the `email_logs` table with the following fields:
- `status`: Text field with possible values ('queued', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'failed', 'skipped_suppressed')
- `opened`: Boolean flag for open status
- `replied_at`: Timestamp for when a reply was received

### Real-time Configuration

The `email_logs` table is enabled for Supabase Realtime through the migration:
- `supabase/migrations/20250127_enable_realtime_email_logs.sql`

This migration adds the table to the `supabase_realtime` publication, allowing real-time subscriptions.

## Usage Example

```typescript
// The component automatically fetches stats on mount
// and subscribes to real-time updates
const channel = supabase
  .channel("campaign_updates")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "email_logs" },
    () => fetchStats()
  )
  .subscribe();
```

## Future Enhancements

Potential improvements could include:
- Time range filtering (e.g., last 24 hours, week, month)
- Campaign-specific filtering
- Percentage calculations (open rate, reply rate)
- Charts and graphs for historical trends
- Export functionality for reporting

## Related Files

- `src/utils/supabase/client.ts` - Supabase client utility
- `src/app/dashboard/components/useRealtimeEmailLogs.ts` - Reusable hook for email logs
- `supabase/migrations/20250127_enable_realtime_email_logs.sql` - Realtime configuration
- `supabase/migrations/20251025_tracking.sql` - Email logs table schema
- `src/app/dashboard/layout.tsx` - Dashboard layout with navigation link

## Implementation Notes

### Client-side Usage

The dashboard is built as a "use client" component because it requires:
1. Interactive React hooks (`useState`, `useEffect`)
2. Real-time subscriptions to Supabase
3. Client-side data fetching and state management

### Performance Considerations

- The component fetches all email logs on initial load and on each real-time update
- For large datasets, consider implementing pagination or filtering
- The real-time subscription listens to ALL changes on the `email_logs` table
- Consider adding debouncing or throttling for high-frequency updates

### Error Handling

The component includes basic error handling that logs errors to the console. In production, consider:
- Showing user-friendly error messages
- Implementing retry logic for failed requests
- Adding loading states during data fetches