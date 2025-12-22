# SmartSend Analytics Dashboard

A comprehensive analytics system for email performance tracking built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

### 📊 Analytics Dashboard
- **KPI Cards**: Sent, Opened, Clicked, Bounced counts
- **Time Series Charts**: Email performance over time with area charts
- **Campaign Analytics**: Bar charts showing open/click rates by campaign
- **Event Distribution**: Pie charts showing event type breakdown
- **Link Analytics**: Top clicked links with CTR metrics

### 🔍 Event Tracking
- **Event Drawer**: Detailed event logs with pagination
- **Per-Recipient Timeline**: Individual lead activity tracking
- **Campaign Drill-down**: View all events for specific campaigns

### 🔗 Link Analytics
- **Click Tracking**: Track which links are clicked most
- **CTR Analysis**: Click-through rates vs opens
- **Per-Link Details**: Individual link performance over time

### 🛡️ Deliverability Management
- **Suppression List**: Manage bounced/complaint addresses
- **Auto-Suppression**: Automatically suppress bounced emails
- **Manual Management**: Add/remove suppressions via UI

### 🔌 Webhook Integration
- **Provider Agnostic**: Supports SendGrid, Postmark, Mailgun
- **Event Normalization**: Converts provider events to standard format
- **HMAC Verification**: Optional webhook signature validation

## Setup

### 1. Database Schema
Run the SQL schema in your Supabase SQL editor:

```sql
-- See supabase/analytics-schema.sql for complete schema
-- Creates tables: campaigns, email_events, suppression_list
-- Creates functions: email_event_buckets
-- Creates views: campaign_stats_view
```

### 2. Environment Variables
Add to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
INGEST_HMAC_SECRET=optional_webhook_secret
```

### 3. Install Dependencies
```bash
npm install recharts lucide-react
```

## Usage

### Analytics Dashboard
Visit `/analytics` to view the main dashboard with:
- Time range selector (1-90 days)
- Interactive charts and tables
- Campaign performance metrics

### Event Tracking
- Click "View events" on any campaign to see detailed logs
- Click recipient emails to view individual timelines
- Events are paginated for performance

### Link Analytics
- View top clicked links in the "Top Links" tab
- Click any link to see its performance over time
- Track CTR (click-through rate) vs opens

### Deliverability Management
Visit `/deliverability` to:
- View suppression list
- Add manual suppressions
- Search by email or domain
- Remove suppressions

### Webhook Integration
Set up webhooks pointing to `/api/ingest/events`:

**SendGrid Example:**
```json
{
  "sg_event_id": "event_id",
  "email": "user@example.com",
  "event": "click",
  "timestamp": 1234567890,
  "url": "https://example.com/link"
}
```

**Postmark Example:**
```json
{
  "RecordType": "Click",
  "Recipient": "user@example.com",
  "MessageID": "msg_id",
  "OriginalLink": "https://example.com/link"
}
```

## API Endpoints

### Analytics
- `GET /api/analytics/summary?days=14` - Main analytics data
- `GET /api/analytics/events?campaign_id=xxx` - Paginated events
- `GET /api/analytics/recipient/[email]` - Recipient timeline
- `GET /api/analytics/links/summary?days=14` - Top links
- `GET /api/analytics/links/detail?url=xxx` - Link performance

### Deliverability
- `GET /api/deliverability/suppressions?q=search` - List suppressions
- `POST /api/deliverability/suppressions` - Add suppression
- `DELETE /api/deliverability/suppressions/[email]` - Remove suppression
- `GET /api/deliverability/summary` - Bounce rate & suppression count

### Webhook
- `POST /api/ingest/events` - Ingest email events

## Data Flow

1. **Email Events**: Sent via webhook to `/api/ingest/events`
2. **Normalization**: Events converted to standard format
3. **Storage**: Saved to `email_events` table
4. **Aggregation**: RPC functions create time buckets
5. **Display**: Charts and tables show aggregated data

## Performance

- **Indexes**: Optimized for fast queries on date, recipient, campaign
- **Pagination**: Events loaded in batches of 30
- **Caching**: API responses cached with `cache: "no-store"`
- **Mock Data**: Fallback data when Supabase unavailable

## Customization

### Adding New Event Types
1. Update `event_type` check constraint in schema
2. Add mapping in `mapEvent()` function
3. Update UI badge variants

### Custom Charts
- Uses Recharts library
- Responsive containers
- Customizable colors and styling

### Provider Integration
- Add new provider in `normalizeProviderPayload()`
- Map provider-specific fields to standard format
- Test with webhook payloads

## Troubleshooting

### No Data Showing
- Check Supabase connection
- Verify webhook endpoints are receiving data
- Run schema setup in Supabase

### Charts Not Rendering
- Ensure Recharts is installed
- Check for JavaScript errors in console
- Verify data format matches chart expectations

### Webhook Issues
- Check HMAC signature if enabled
- Verify JSON payload format
- Test with curl or webhook testing tools

## Security

- **HMAC Verification**: Optional webhook signature validation
- **Service Role Key**: Required for Supabase operations
- **Input Validation**: All inputs sanitized and validated
- **Rate Limiting**: Consider adding rate limits for webhooks

## Monitoring

- **Error Handling**: Graceful fallbacks to mock data
- **Logging**: Console errors logged for debugging
- **Health Checks**: API endpoints return status information

## Future Enhancements

- Real-time updates with WebSockets
- Advanced filtering and segmentation
- Export functionality (CSV/PDF)
- A/B testing analytics
- Advanced deliverability metrics
- Integration with more email providers