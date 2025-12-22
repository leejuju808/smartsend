# Lite Analytics Implementation — Slice #4

**Status:** ✅ Complete  
**Date:** October 10, 2025

## Overview

Lite Analytics closes the loop on the North Star metric (MB/100) by surfacing:
- **MB/100 (30d)** — Meetings Booked per 100 Replies
- **Replies → Meetings %** — Conversion rate
- **Sender Health** — At-a-glance health status per sender

## What Was Built

### 1. Database Migration

**File:** `supabase/migrations/20251010_lite_analytics.sql`

Created:
- `replies` table (if not already exists) to track inbound prospect replies
- `metrics_days` view — 30-day date range generator
- `metrics_replies_daily` view — Daily reply counts (last 30d)
- `metrics_meetings_daily` view — Daily meeting counts (last 30d)
- `metrics_rollup_30d` view — 30-day totals with MB/100 calculation
- `metrics_today` view — Today's snapshot (replies + meetings)
- `metrics_per_sender_7d` view — Per-sender 7-day rollup with health color

### 2. API Endpoints

#### `/api/replies/ingest/route.ts`
Ingests inbound replies into the system.

**POST Payload:**
```json
{
  "sender_email": "prospect@domain.com",
  "to_sender_email": "you@yourdomain.com",
  "message_id": "msg_123",
  "campaign_id": "uuid",
  "intent": "MEETING_INTENT",
  "body_excerpt": "first 200 chars",
  "received_at": "2025-10-10T19:00:00Z"
}
```

#### `/api/analytics/summary/route.ts`
Returns aggregate metrics for the dashboard.

**Response:**
```json
{
  "mb_per_100_30d": 12.5,
  "replies_30d": 80,
  "meetings_30d": 10,
  "replies_today": 3,
  "meetings_today": 1,
  "per_sender_7d": [...]
}
```

#### `/api/analytics/timeseries/route.ts`
Returns daily time-series data for charts.

**Response:**
```json
{
  "replies_daily": [
    {"day": "2025-10-01", "replies": 5},
    ...
  ],
  "meetings_daily": [
    {"day": "2025-10-01", "meetings": 1},
    ...
  ]
}
```

### 3. Dashboard UI

**File:** `src/app/(dashboard)/analytics/page.tsx`

Features:
- **4 KPI Cards:**
  - MB/100 (30d) — highlighted in emerald
  - Replies (30d)
  - Meetings (30d)
  - Today: Replies → Meetings
  
- **2 Time-Series Tables:**
  - Replies — last 30 days
  - Meetings — last 30 days
  
- **Per-Sender Cards (7d):**
  - Health status badge (red/yellow/green)
  - Sender email
  - 7-day replies, meetings, MB/100

All built with Tailwind CSS, zero external charting dependencies.

## How to Run

### 1. Apply the Migration

In Supabase SQL Editor, run:
```bash
supabase/migrations/20251010_lite_analytics.sql
```

### 2. Start Development Server

```bash
pnpm dev
```

### 3. Test with Sample Data

**Ingest a reply:**
```bash
curl -X POST http://localhost:3000/api/replies/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sender_email": "prospect1@example.com",
    "to_sender_email": "you@domain.com",
    "intent": "MEETING_INTENT",
    "body_excerpt": "Yes let'\''s talk tomorrow"
  }'
```

**Insert a meeting** (in Supabase SQL Editor):
```sql
insert into public.meetings (message_id, sender_email, calendly_url, ics_blob, detected_at)
values ('msg_test_1', 'prospect1@example.com', 'https://calendly.com/your_link', 'ICS...', now());
```

### 4. View Dashboard

Navigate to: `http://localhost:3000/analytics`

## Acceptance Criteria

✅ KPI cards show non-zero totals after seeding  
✅ Time-series tables list last 30 days with data on today's row  
✅ Per-sender section lists each mailbox from `send_policies` with 7-day MB/100 and health color  
✅ MB/100 prominently displayed — ties every decision back to bookings  
✅ Replies → Meetings % shows conversion health  
✅ Per-sender cards connect warmup/health to outcomes (meetings), not vanity sends  

## Why This Matters

- **MB/100 laser focus** — North Star metric surfaced prominently
- **Conversion health** — Replies → Meetings % validates copy quality + intent detection
- **Sender health tied to outcomes** — Connects warmup/health to actual meetings booked, not just sends

## Environment Variables Required

Ensure these are set in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Integration Points

- Depends on existing `meetings` table (from previous slice)
- Depends on `sender_health_today` view (from previous slice)
- Depends on `send_policies` table for sender enumeration

## Next Steps

1. Wire up your existing reply ingestion pipeline to call `/api/replies/ingest`
2. Set up webhooks or IMAP listeners to auto-ingest incoming replies
3. Add filtering by date range or campaign in future iterations
4. Consider adding simple charts (recharts) for visual trends
