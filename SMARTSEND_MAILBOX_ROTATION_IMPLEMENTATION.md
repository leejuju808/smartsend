# SmartSend Mailbox Rotation + Per-Domain Throttling + Open/Click Tracking

This implementation adds advanced deliverability features to SmartSend:

## Features Implemented

### 1. Database Schema
- **Mailboxes table**: Stores mailbox configurations with daily caps
- **Mailbox daily usage**: Tracks daily send counts per mailbox
- **Domain daily caps**: Configurable limits per recipient domain
- **Domain daily usage**: Tracks daily send counts per domain
- **Tracking tokens**: Secure tokens for open/click tracking
- **Tracking events**: Records open/click events with metadata
- **Deliverability settings**: Global settings for send windows and defaults

### 2. Core Libraries
- **`src/lib/mailbox-rotation.ts`**: Mailbox rotation, domain throttling, send window management
- **`src/lib/tracking.ts`**: Open pixel and link tracking functionality

### 3. API Endpoints
- **`/api/t/o/[token]`**: Open tracking pixel endpoint
- **`/api/t/c/[token]`**: Click tracking redirect endpoint
- **`/api/settings/deliverability/get`**: Get deliverability settings
- **`/api/settings/deliverability/set`**: Update deliverability settings

### 4. Updated Cron Sender
- **`src/app/api/cron/campaigns/route.ts`**: Enhanced with:
  - Mailbox rotation (least used under cap)
  - Per-domain daily throttling
  - Send window enforcement (reschedules outside window)
  - Automatic tracking pixel injection
  - Link rewriting for click tracking

### 5. UI Components
- **Deliverability Settings Page**: Manage mailboxes, domain caps, send windows
- **Enhanced Campaign Stats**: Shows opens, clicks, and engagement rates

## Database Migration

Run the SQL migration to create all required tables:

```sql
-- Run: supabase/migrations/20250120_add_mailbox_rotation_and_tracking.sql
```

## Installation

1. **Install dependencies**:
   ```bash
   npm install luxon
   ```

2. **Run database migration**:
   ```bash
   # Apply the migration file to your Supabase database
   ```

3. **Deploy the updated code**

## Configuration

### Setting Up Mailboxes

1. Navigate to **Dashboard > Settings > Deliverability**
2. Add mailboxes with:
   - Name and from email
   - Daily send cap
   - SMTP credentials (if using custom SMTP)

### Setting Domain Caps

1. In the same settings page, add domain-specific daily caps
2. Example: Limit `@acme.com` to 20 emails per day

### Configuring Send Windows

1. Set your preferred send window (e.g., 9 AM - 5 PM)
2. Choose your timezone
3. Emails outside the window are automatically rescheduled

## How It Works

### Mailbox Rotation
- System automatically selects the least-used active mailbox under its daily cap
- Ensures even distribution across all available mailboxes
- Prevents any single mailbox from hitting its limit

### Domain Throttling
- Tracks daily sends per recipient domain
- Respects both global defaults and domain-specific caps
- Automatically reschedules when caps are reached

### Send Windows
- Checks current time against configured send window
- Reschedules emails outside the window to the next available time
- Respects user's timezone settings

### Tracking System
- **Open Tracking**: 1x1 pixel injected into every email
- **Click Tracking**: All links rewritten to go through tracking endpoint
- **Secure Tokens**: Each tracking event uses unique, expiring tokens
- **Event Recording**: Stores IP, user agent, referrer for analytics

## Testing

### 1. Setup Test Environment
- Add 2+ active mailboxes with different daily caps
- Set domain caps (e.g., 5 per domain)
- Configure send window

### 2. Test Campaign
- Queue recipients from mixed domains
- Start campaign
- Verify:
  - Mailboxes rotate evenly
  - Domain caps are respected
  - Emails contain tracking pixel
  - Links redirect through tracking

### 3. Verify Tracking
- Open emails → Open events recorded
- Click links → Click events recorded + redirects work
- Check campaign stats for opens/clicks

## Monitoring

### Campaign Dashboard
- Real-time opens and clicks
- Open rate and click rate percentages
- Total vs unique engagement metrics

### Deliverability Insights
- Mailbox usage patterns
- Domain cap effectiveness
- Send window compliance

## Next Steps

### Advanced Features
- **Hourly caps**: More granular throttling
- **Auto-warmup**: Gradual capacity increases for new mailboxes
- **Risk scoring**: MX record analysis for stricter domains
- **Team scoping**: Workspace-level mailbox management

### Performance Optimizations
- **JWT tokens**: Reduce database lookups
- **Batch processing**: Bulk tracking event creation
- **Caching**: Frequently accessed settings and stats

## Troubleshooting

### Common Issues

1. **No mailboxes available**:
   - Check mailbox `is_active` status
   - Verify daily caps aren't exceeded
   - Ensure proper user/workspace association

2. **Tracking not working**:
   - Verify tracking tokens table exists
   - Check API endpoint accessibility
   - Ensure proper base URL configuration

3. **Domain caps not enforced**:
   - Verify domain caps table populated
   - Check user/workspace association
   - Review cron job execution

### Debug Mode
Enable detailed logging in the cron sender for troubleshooting:
```typescript
console.log('Mailbox selection:', mailbox);
console.log('Domain cap check:', canSendToDomain);
console.log('Send window check:', shouldReschedule);
```

## Security Notes

- Tracking tokens expire after 30 days
- IP addresses and user agents are stored for analytics
- All database operations use service role for cron jobs
- RLS policies should be configured for user data access

## Performance Considerations

- Daily usage counters use atomic increments
- Tracking events are batched where possible
- Expired tokens are cleaned up automatically
- Indexes on frequently queried fields

---

**Status**: ✅ Implemented and Ready for Testing
**Last Updated**: January 20, 2025
**Version**: 1.0.0 