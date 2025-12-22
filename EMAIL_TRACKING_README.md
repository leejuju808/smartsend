# Email Tracking Implementation

This implementation adds comprehensive email tracking capabilities to SmartSend AI, including open and click tracking with analytics.

## Features

- **Open Tracking**: 1x1 transparent pixel tracks email opens
- **Click Tracking**: All links are wrapped with redirect URLs to track clicks
- **Analytics Dashboard**: Real-time metrics showing sent, opens, clicks, open rate, and CTR
- **Privacy Compliant**: Uses job IDs as tracking tokens (no extra tables needed)

## Database Schema

Run the SQL migration in `supabase/migrations/001_email_tracking.sql` to create the `email_events` table.

## Components

### 1. Tracking Utilities (`src/lib/tracking.ts`)
- `rewriteLinks()`: Wraps all HTTP(S) links with tracking redirects
- `injectPixel()`: Adds 1x1 tracking pixel to email body
- `withTracking()`: Applies both link rewriting and pixel injection
- `decodeTrackedUrl()`: Decodes Base64URL-encoded destination URLs

### 2. Tracking Endpoints
- **`/t/o`**: Open tracking pixel endpoint (returns 1x1 GIF)
- **`/t/c`**: Click tracking redirect endpoint

### 3. Metrics API (`/api/metrics/email`)
Returns 30-day email metrics:
- `sent`: Number of emails sent
- `opens`: Number of opens tracked
- `clicks`: Number of clicks tracked
- `openRate`: Open rate percentage
- `ctr`: Click-through rate percentage

### 4. Dashboard Integration
- `EmailMetricsBadge` component displays metrics in dashboard header
- Shows: "30d: Sent X • Open Y% • Click Z%"

## Usage

### In Email Sending Code
```typescript
import { withTracking } from "@/lib/tracking";

// Before sending email
const trackedHtml = withTracking(html, jobId);

await sendEmail({
  to: recipient,
  subject: subject,
  html: trackedHtml,
  headers: { /* ... */ }
});
```

### Tracking URLs
- **Open pixel**: `/t/o?j={jobId}`
- **Click redirect**: `/t/c?j={jobId}&u={base64urlEncodedDestination}`

## Privacy & Security Notes

- **Approximate Opens**: Open tracking is approximate due to image blocking and bot prefetch (like Apple MPP)
- **Secure Redirects**: Click redirects validate HTTP(S) URLs only; everything else falls back to your site
- **No-Cache Headers**: Pixel endpoint sets no-store headers to prevent caching
- **Brand Domains**: Consider hosting `/t/*` on your branded domain for better deliverability

## Implementation Status

✅ Database schema created  
✅ Tracking utilities implemented  
✅ Pixel tracking endpoint created  
✅ Click tracking endpoint created  
✅ Cron worker updated with tracking  
✅ Metrics API implemented  
✅ Dashboard UI badge added  

## Next Steps

1. Run the SQL migration in Supabase
2. Test email sending with tracking enabled
3. Verify metrics appear in dashboard
4. Consider adding more detailed analytics views
5. Implement unsubscribe handling if needed