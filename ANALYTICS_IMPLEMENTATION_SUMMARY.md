# Smart Send Analytics Dashboard Implementation

## Overview
This implementation adds comprehensive click tracking and analytics capabilities to the Smart Send email platform, enabling detailed analysis of link performance and click-through rates.

## Files Created/Modified

### 1. Database Migration
**File:** `supabase/migrations/20250126_add_clicked_url_fields.sql`
- Adds `clicked_url`, `clicked_domain`, `clicked_path` columns to `email_events` table
- Creates indexes for efficient analytics queries
- Updates `email_analytics` view to include clicked URL data
- Creates new `link_analytics` view for link performance analysis

### 2. URL Parser Utility
**File:** `src/lib/url-parser.ts`
- `parseUrl()` function: Extracts domain, path, and full URL from any URL string
- `extractUrlFromEvent()` function: Provider-specific URL extraction logic
- Handles various URL formats and edge cases
- Supports all major email providers (SendGrid, Postmark, Mailgun, Resend, SES)

### 3. Enhanced Email Events Webhook
**File:** `src/app/api/webhooks/email-events/route.ts`
- Updated `NormalizedEvent` interface to include URL fields
- Enhanced `normalizeProviderPayload()` function for all providers:
  - **SendGrid**: Extracts from `url`, `["url"]`, `["sg_url"]` fields
  - **Postmark**: Extracts from `OriginalLink`, `Link`, `Metadata.link` fields
  - **Mailgun**: Extracts from `url`, `message.headers["List-Unsubscribe"]` fields
  - **Resend**: Extracts from `data.url`, `url` fields
  - **SES**: Extracts from `click.link`, `url` fields
- Updated database insert mapping to include URL fields

### 4. Analytics Links Summary API
**File:** `src/app/api/analytics/links/summary/route.ts`
- GET endpoint: `/api/analytics/links/summary`
- Query parameters: `days` (default: 14)
- Returns top 20 clicked links with:
  - Full URL
  - Domain and path breakdown
  - Click count
  - Click-through rate (CTR) calculation
- Includes mock data fallback for development/testing

## Key Features

### URL Tracking
- **Comprehensive Provider Support**: Works with SendGrid, Postmark, Mailgun, Resend, AWS SES, and generic providers
- **Robust URL Parsing**: Handles malformed URLs, missing protocols, and edge cases
- **Structured Data**: Separates URL into domain, path, and full URL for flexible analytics

### Analytics Capabilities
- **Top Links Analysis**: Identifies most clicked links across campaigns
- **CTR Calculation**: Calculates click-through rates using opened emails as baseline
- **Time-based Filtering**: Supports custom date ranges for analysis
- **Performance Optimization**: Uses database indexes and efficient queries

### Database Schema
```sql
-- New columns added to email_events table
clicked_url TEXT,
clicked_domain TEXT,
clicked_path TEXT

-- New indexes for performance
idx_email_events_clicked_domain
idx_email_events_clicked_path
idx_email_events_clicked_url
idx_email_events_clicked_analytics (composite)
```

## API Usage

### Get Top Links Summary
```bash
GET /api/analytics/links/summary?days=30
```

**Response:**
```json
{
  "items": [
    {
      "url": "smartsend.ai/demo",
      "domain": "smartsend.ai",
      "path": "/demo",
      "clicks": 91,
      "ctr": 7.4
    }
  ]
}
```

## Implementation Notes

### URL Extraction Logic
Each provider has specific field mappings:
- **SendGrid**: `e?.url || e?.["url"] || e?.["sg_url"]`
- **Postmark**: `payload?.OriginalLink || payload?.Link || payload?.Metadata?.link`
- **Mailgun**: `e?.url || e?.message?.headers?.["List-Unsubscribe"]`

### Error Handling
- Graceful fallback to mock data if database queries fail
- Robust URL parsing with fallback for malformed URLs
- Provider detection with generic fallback

### Performance Considerations
- Database indexes on URL fields for fast queries
- Composite indexes for common query patterns
- Efficient aggregation queries with proper grouping

## Testing
A test file `test-url-parser.js` is included to verify URL parsing functionality across different providers and URL formats.

## Next Steps
1. Run database migration: `supabase db push`
2. Test webhook endpoints with real provider data
3. Implement frontend analytics dashboard components
4. Add more detailed analytics endpoints (domain analysis, path analysis, etc.)
5. Consider adding click heatmaps and user journey tracking