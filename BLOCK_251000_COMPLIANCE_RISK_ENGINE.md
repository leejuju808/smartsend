# Block 251000 — Compliance Risk Engine Implementation

## Overview

This implementation adds a Compliance Risk Engine that calculates certification and training risk for every employee, exposing it via SQL views, a daily Edge Function digest, and UI components.

**Key Value Proposition:**
> "We used to get blindsided by OSHA / insurance. Now SmartSend tells us BEFORE it's a problem."

## Implementation Summary

### 1. SQL Views (Migration: `20250130000002_block251000_compliance_risk_engine.sql`)

#### `workforce_certification_status`
- Calculates certification risk status for all active employees
- Status values: `valid`, `expired`, `expiring_7`, `expiring_30`, `unknown`
- Includes employee info, cert details, and calculated status

#### `workforce_training_status`
- Shows per-employee training completion metrics
- Calculates: total required modules, completed required modules, completion percentage
- Only includes employees with required training

#### `workforce_training_risk`
- Adds risk bands to training status
- Risk levels: `none_required`, `low` (≥90%), `medium` (≥60%), `high` (<60%)

#### Helper Function: `get_compliance_summary`
- Returns aggregated counts for certifications and training risk
- Useful for dashboard summaries

### 2. Edge Function (`supabase/functions/workforce_compliance_digest/index.ts`)

Daily compliance digest that:
- Checks for expired/expiring certifications (7 and 30 days)
- Identifies high-risk training employees
- Builds a text digest
- Sends to webhook (if `COMPLIANCE_WEBHOOK_URL` env var is set)
- Returns early if no issues found

**Setup:**
- Set up a Supabase Scheduled Task (cron) to call this function daily
- URL: `https://<project-ref>.functions.supabase.co/workforce_compliance_digest`
- Schedule: `0 11 * * *` (11:00 UTC daily)

### 3. API Route (`src/app/api/workforce/compliance/route.ts`)

New endpoint: `GET /api/workforce/compliance`

**Query Parameters:**
- `type`: `certifications` | `training` | (default: both)

**Response Structure:**
```json
{
  "certifications": {
    "data": [...],
    "summary": {
      "expired": 0,
      "expiring_7": 0,
      "expiring_30": 0,
      "valid": 0,
      "unknown": 0
    }
  },
  "training": {
    "data": [...],
    "summary": {
      "high": 0,
      "medium": 0,
      "low": 0,
      "none_required": 0
    }
  }
}
```

### 4. UI Components Updated

#### `CertificationsManager` Component
- **New:** Summary chips at top showing counts by status
- **New:** Clickable chips to filter by status
- **Updated:** Uses `workforce_certification_status` view
- **New:** Shows role column
- **Improved:** Better status badges with icons

#### `WorkforceDashboard` Component
- **Updated:** Certification Risk card shows expired + expiring counts
- **Updated:** Training Risk card shows high/medium/low breakdown
- **New:** Fetches compliance data from new API

#### `WorkforceOverviewPage` Component
- **Updated:** Training Completion card shows risk breakdown
- **Updated:** Certification Risk card shows expired/expiring counts
- **New:** Training alerts section shows high-risk employees
- **New:** Certification alerts section shows expired/expiring certs

## Database Schema

### Views Created
1. `workforce_certification_status` - Certification risk per employee/cert
2. `workforce_training_status` - Training completion per employee
3. `workforce_training_risk` - Training risk levels per employee

### Indexes Added
- `idx_workforce_certifications_employee_expiry` - For fast cert expiry queries
- `idx_workforce_training_progress_employee_status` - For fast training status queries

## Usage Examples

### Query Certification Risk
```sql
SELECT * FROM workforce_certification_status 
WHERE company_id = '...' 
AND status IN ('expired', 'expiring_30');
```

### Query Training Risk
```sql
SELECT * FROM workforce_training_risk 
WHERE company_id = '...' 
AND risk_level = 'high';
```

### Get Compliance Summary
```sql
SELECT * FROM get_compliance_summary('company-uuid');
```

## Next Steps

1. **Set up Edge Function Cron:**
   - Go to Supabase Dashboard → Database → Cron Jobs
   - Create new cron job pointing to `workforce_compliance_digest`
   - Set schedule: `0 11 * * *` (or your preferred time)

2. **Configure Webhook (Optional):**
   - Set `COMPLIANCE_WEBHOOK_URL` environment variable in Supabase
   - Create a Next.js API route to handle the webhook
   - Send emails/Slack notifications from that route

3. **Test the Views:**
   - Run the migration
   - Verify views are accessible
   - Test with sample data

4. **UI Testing:**
   - Navigate to `/dashboard/workforce` → Certifications tab
   - Verify summary chips appear and work
   - Check Workforce Overview page shows compliance data

## Files Created/Modified

### Created
- `supabase/migrations/20250130000002_block251000_compliance_risk_engine.sql`
- `supabase/functions/workforce_compliance_digest/index.ts`
- `src/app/api/workforce/compliance/route.ts`

### Modified
- `src/components/workforce/CertificationsManager.tsx`
- `src/components/workforce/WorkforceDashboard.tsx`
- `src/app/workforce/page.tsx`

## Notes

- Views automatically respect RLS from underlying tables
- Edge Function uses service role key for full access
- All dates use `CURRENT_DATE` for consistency
- Training risk calculation only includes employees with required modules
- Certification status prioritizes "expired" over "expiring" in logic
























