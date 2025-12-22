# Email Sending System Implementation

This document outlines the complete email sending system implementation with batch approval, queue management, and SMTP sending capabilities.

## Overview

The system consists of:
1. **Batch Approval API** - Approve and queue multiple drafts at once
2. **Enhanced UI** - Bulk selection interface in Draft Review
3. **SMTP Sender Worker** - Process queued emails via Nodemailer
4. **Cron Integration** - Automated processing of send queue

## Components

### 1. Batch Approve & Queue API
**File:** `/src/app/api/drafts/batch-approve-queue/route.ts`

- Accepts array of draft IDs
- Updates all drafts to "approved" status
- Sequentially enqueues each draft (respects unique index + rate limits)
- Returns success/failure counts

### 2. Enhanced Draft Review UI
**File:** `/src/components/drafts/DraftReviewDrawer.tsx`

**New Features:**
- Bulk selection with checkboxes
- Select All / Clear All buttons
- Batch Approve → Queue Selected button
- Real-time status updates

**UI Elements Added:**
```tsx
// Bulk action toolbar
<div className="flex gap-2 mb-4">
  <button onClick={selectAll}>Select all</button>
  <button onClick={clearAll}>Clear</button>
  <button onClick={batchApproveQueue}>Approve → Queue Selected</button>
</div>

// Checkbox in each draft card
<input
  type="checkbox"
  checked={!!selected[d.id]}
  onChange={() => toggle(d.id)}
  className="mt-1 accent-yellow-400"
/>
```

### 3. SMTP Sender Worker
**File:** `/src/lib/sender.ts`

**Features:**
- Fetches queued emails from `send_queue` table
- Sends via Nodemailer SMTP
- Updates status: queued → sending → sent/failed
- Rate limiting with configurable throttle
- Optional delivery counter updates

**Configuration:**
```typescript
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT || "587"),
  secure: false, // true if port 465
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});
```

### 4. Send Due API Route
**File:** `/src/app/api/queue/send-due/route.ts`

- Cron-friendly GET endpoint
- Triggers sender worker
- Returns processing results
- Can be called manually or via scheduled jobs

## Environment Variables

Add these to your `.env.local`:

```bash
# SMTP Configuration
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_password

# Sender Worker Configuration
MAIL_FROM="SmartSend <no-reply@yourdomain.com>"
SEND_BATCH_LIMIT=25
SEND_THROTTLE_MS=150
```

## Database Requirements

Ensure your `send_queue` table has:
- `status` column (queued, sending, sent, failed)
- `scheduled_at` column for timing
- `created_at` column for ordering
- Unique index on campaign_id + lead_id to prevent duplicates

## Usage

### Manual Testing
```bash
# Test the sender worker
curl http://localhost:3000/api/queue/send-due

# Test batch approval (via UI)
# 1. Open Draft Review
# 2. Select drafts with checkboxes
# 3. Click "Approve → Queue Selected"
```

### Production Setup

#### Vercel Cron Jobs
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/queue/send-due",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

#### Manual Cron
```bash
# Every 5 minutes
*/5 * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/queue/send-due
```

## Safety Features

1. **Rate Limiting** - Configurable throttle between sends
2. **Status Tracking** - Clear queued → sending → sent/failed flow
3. **Error Handling** - Failed sends marked appropriately
4. **Batch Limits** - Configurable batch size to prevent overload
5. **Unique Constraints** - Prevents duplicate queueing

## Monitoring

The system provides:
- Success/failure counts in API responses
- Status updates in UI
- Failed IDs tracking for debugging
- Optional delivery counter updates

## CAN-SPAM Compliance

Before production:
1. Add unsubscribe footer to email templates
2. Include physical address in emails
3. Ensure proper sender identification
4. Implement unsubscribe handling

## Troubleshooting

### Common Issues
1. **SMTP Authentication Failed** - Check credentials and host/port
2. **Rate Limiting** - Increase `SEND_THROTTLE_MS` if hitting provider limits
3. **Duplicate Sends** - Ensure unique index is in place
4. **Cron Not Running** - Check Vercel cron configuration or manual cron setup

### Debug Commands
```bash
# Check queue status
curl http://localhost:3000/api/queue/send-due

# Test SMTP connection (add to sender.ts temporarily)
transporter.verify((error, success) => {
  if (error) console.log(error);
  else console.log('SMTP ready');
});
```