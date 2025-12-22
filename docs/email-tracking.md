# Email Tracking System

This system provides comprehensive email tracking capabilities including open tracking, click tracking, and analytics.

## Components

### 1. Database Schema
- **`email_messages`**: Stores sent email records with metadata
- **`email_events`**: Tracks opens, clicks, bounces, and replies
- **`email_message_stats`**: View for aggregated statistics

### 2. Edge Functions
- **`track-open`**: Serves 1x1 pixel and logs email opens
- **`track-click`**: Redirects links and logs clicks

### 3. Tracking Library
- **`lib/tracking.ts`**: HTML injection utility for adding tracking

### 4. Integration
- **`queue-dispatcher`**: Modified to create message records and inject tracking

## Usage

### Sending Emails
The system automatically:
1. Creates an `email_messages` record before sending
2. Injects tracking pixels and rewrites links
3. Sends the email with tracking enabled
4. Updates the message record with provider ID

### Tracking Events
- **Opens**: Automatically tracked via 1x1 pixel
- **Clicks**: Automatically tracked via link rewriting
- **Bounces**: Can be integrated with email provider webhooks
- **Replies**: Can be integrated with reply handling system

### Analytics
Query the `email_message_stats` view for aggregated data:

```sql
SELECT 
  message_id,
  campaign_id,
  lead_id,
  opens,
  clicks,
  first_open_at,
  first_click_at
FROM email_message_stats
WHERE campaign_id = 'your-campaign-id';
```

## Environment Variables

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Base URL for tracking endpoints
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

## Security

- RLS policies ensure users can only access their workspace data
- Service role required for inserting events
- URL validation prevents malicious redirects
- IP and user agent logging for analytics

## Testing

Run the test suite to verify tracking functionality:

```bash
npm test tests/email-tracking.test.ts
```