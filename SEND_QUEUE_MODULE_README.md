# Send Queue Module - Complete Implementation

## Overview

The Send Queue Module provides real-time email sending capabilities with queue management, retry logic, and comprehensive monitoring. It's designed to handle scheduled email tasks from Supabase in real-time.

## Components

### 1. SendQueue Component (`src/components/dashboard/SendQueue.tsx`)

A comprehensive React component that provides:
- Real-time queue monitoring with Supabase subscriptions
- Visual status indicators and statistics
- Manual execution controls
- Retry functionality for failed sends
- Responsive design with modern UI

**Features:**
- Real-time updates via Supabase real-time subscriptions
- Status badges and icons for different queue states
- Statistics cards showing pending, sending, sent, and failed counts
- Manual "Send Now" and "Retry" buttons
- Error handling and user feedback

### 2. Supabase Edge Function (`supabase/functions/execute_send/index.ts`)

A Deno-based Edge Function that handles:
- Email execution from the queue
- Personalization with `{{variable}}` replacement
- SMTP sending (placeholder implementation)
- Error handling and retry logic
- Event logging

**Features:**
- Task validation and status management
- Email personalization
- Retry logic with exponential backoff
- Comprehensive error handling
- Event logging for tracking

### 3. Send Queue Manager (`src/lib/send-queue.ts`)

A utility class providing:
- Queue management functions
- Bulk operations
- Statistics and monitoring
- Type-safe interfaces

**Methods:**
- `addToQueue()` - Add single email to queue
- `bulkAddToQueue()` - Add multiple emails
- `getQueueItems()` - Fetch queue items
- `executeQueueItem()` - Execute specific task
- `retryQueueItem()` - Retry failed task
- `cancelQueueItem()` - Cancel task
- `getQueueStats()` - Get queue statistics

### 4. Test Page (`src/app/test-send-queue/page.tsx`)

A complete test interface that demonstrates:
- Adding emails to the queue
- Real-time monitoring
- Personalization testing
- Queue management

## Database Schema

The module uses the existing `send_queue` table with the following structure:

```sql
create table public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_lower citext not null,
  name text,
  company text,
  custom_fields jsonb default '{}',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','bounced','unsubscribed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  error text,
  sent_at timestamptz,
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

## Usage Examples

### Basic Usage

```tsx
import SendQueue from "@/components/dashboard/SendQueue";

export default function Dashboard() {
  return (
    <div>
      <h1>Email Dashboard</h1>
      <SendQueue />
    </div>
  );
}
```

### Programmatic Queue Management

```tsx
import { SendQueueManager } from "@/lib/send-queue";

// Add email to queue
const queueItem = await SendQueueManager.addToQueue({
  campaignId: "campaign-uuid",
  userId: "user-uuid",
  email: "recipient@example.com",
  name: "John Doe",
  company: "Acme Corp",
  customFields: { custom_var: "value" },
  scheduledFor: new Date(Date.now() + 60000).toISOString() // 1 minute from now
});

// Execute immediately
await SendQueueManager.executeQueueItem(queueItem.id);

// Get statistics
const stats = await SendQueueManager.getQueueStats("user-uuid");
console.log(`Pending: ${stats.pending}, Sent: ${stats.sent}`);
```

### Bulk Operations

```tsx
const recipients = [
  { email: "user1@example.com", name: "User 1", company: "Company A" },
  { email: "user2@example.com", name: "User 2", company: "Company B" },
  { email: "user3@example.com", name: "User 3", company: "Company C" }
];

const result = await SendQueueManager.bulkAddToQueue({
  campaignId: "campaign-uuid",
  userId: "user-uuid",
  recipients,
  scheduledFor: new Date(Date.now() + 300000).toISOString() // 5 minutes from now
});

console.log(`Success: ${result.success}, Failed: ${result.failed}`);
```

## Personalization

The system supports email personalization using `{{variable}}` syntax:

**Available Variables:**
- `{{first_name}}` - First name from contact
- `{{name}}` - Full name
- `{{company}}` - Company name
- `{{email}}` - Email address
- Any custom fields from `custom_fields` JSON

**Example:**
```
Subject: Hello {{first_name}}!

Body: Hi {{first_name}},

I hope this email finds you well at {{company}}.

Best regards,
Sender
```

## Real-time Features

The SendQueue component automatically updates in real-time using Supabase subscriptions:

1. **New items** - Automatically appear when added
2. **Status changes** - Update immediately as emails are processed
3. **Error updates** - Show errors and retry options
4. **Statistics** - Update counters in real-time

## Error Handling

The system includes comprehensive error handling:

1. **Retry Logic** - Failed emails are automatically retried up to `max_attempts`
2. **Exponential Backoff** - Retry delays increase with each attempt
3. **Status Tracking** - Clear status indicators for all states
4. **Error Messages** - Detailed error information for debugging

## Testing

Use the test page at `/test-send-queue` to:

1. Add test emails to the queue
2. Monitor real-time updates
3. Test personalization
4. Verify error handling
5. Test retry functionality

## Deployment

### Supabase Edge Function

Deploy the Edge Function to Supabase:

```bash
supabase functions deploy execute_send
```

### Environment Variables

Ensure these environment variables are set:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### SMTP Configuration

Replace the placeholder SMTP implementation in the Edge Function with your actual email service:

```typescript
// In supabase/functions/execute_send/index.ts
// Replace the sendEmail function with your SMTP implementation
```

## Security

- Row-level security is enabled on the `send_queue` table
- Users can only access their own queue items
- Edge Function uses service role key for database access
- Input validation and sanitization included

## Performance

- Queue items are limited to 100 per view to prevent UI overload
- Real-time subscriptions are properly cleaned up
- Efficient database queries with proper indexing
- Batch operations for bulk adds

## Future Enhancements

Potential improvements:
1. **Rate Limiting** - Implement per-user rate limits
2. **Priority Queues** - Support for high-priority emails
3. **Scheduling** - More sophisticated scheduling options
4. **Analytics** - Detailed sending analytics and reports
5. **Templates** - Email template management
6. **A/B Testing** - Split testing capabilities

## Troubleshooting

### Common Issues

1. **Emails not sending** - Check SMTP configuration in Edge Function
2. **Real-time not working** - Verify Supabase subscription setup
3. **Permission errors** - Check RLS policies on send_queue table
4. **Edge Function errors** - Check Supabase function logs

### Debugging

Enable detailed logging in the Edge Function:

```typescript
console.log("Processing task:", taskId);
console.log("Campaign data:", campaign);
console.log("Email content:", { subject, html, text });
```

This completes the Send Queue Module implementation with real-time capabilities, comprehensive error handling, and a modern user interface.