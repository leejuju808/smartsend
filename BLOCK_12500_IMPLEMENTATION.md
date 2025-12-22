# Block 12500 — SmartSend Roofing Lead Export v1

## Implementation Summary

The Simple Export System That Gives Roofers Control Without Letting Them Abuse It.

### ✅ Completed Features

1. **Database Migration** (`supabase/migrations/20250130000001_block12500_lead_export_v1.sql`)
   - `exports` table for tracking export requests
   - `export_rate_limits` table for rate limiting
   - Functions: `can_export_leads()`, `record_export_request()`
   - Storage bucket `exports` with RLS policies

2. **API Routes**
   - `POST /api/exports` - Initiate export request
   - `GET /api/exports` - List user's exports
   - `GET /api/exports/[id]` - Check export status and get download URL

3. **Background Worker** (`app/api/cron/exports/worker/route.ts`)
   - Processes pending exports every minute
   - Generates CSV with all required columns
   - Uploads to Supabase storage
   - Updates export status

4. **CSV Generation** (`lib/exports/csvGenerator.ts`)
   - All required columns per spec:
     - homeowner_email, first_name, last_name, city, state, zip
     - tags (CSV within CSV)
     - lead_status, dates (first contacted, last message sent, last reply)
     - last_reply_snippet (truncated, not full threads)
     - assigned_team_member, campaign_origin
     - created_at, updated_at

5. **UI Components**
   - `ExportLeadsModal` - Modal with export options and status tracking
   - Export button added to `/contacts` page
   - Real-time polling for export status
   - Download link when ready

6. **Security & Permissions**
   - Only Owner or Manager can export (Staff cannot)
   - Rate limiting: 1 export per 10 minutes, max 10 per day
   - Workspace-scoped exports (no cross-company leaks)
   - Download links expire after 24 hours

### 📋 Export Columns Included

✅ **Included:**
- Homeowner email, name, city, state, ZIP
- Tags (CSV format)
- Lead status (HOT/WARM/etc.)
- Date first contacted
- Date last message sent
- Date of last reply
- Last reply snippet (truncated to 200 chars)
- Assigned team member
- Campaign origin
- Created/updated timestamps

❌ **NOT Included (as per spec):**
- Full email text bodies (only snippets)
- Follow-up templates
- AI classifications or automation logic
- Internal tasks or system events
- Sending schedule

### 🔧 Technical Details

**Export Flow:**
1. User clicks "Export Leads" button
2. Modal opens with filter options (scope, status, date range)
3. User submits export request
4. API creates export record with status "pending"
5. Background worker picks up pending exports
6. Worker queries contacts based on filters
7. Worker gathers related data (replies, campaigns, assignments)
8. Worker generates CSV file
9. Worker uploads to Supabase storage
10. Worker updates export status to "complete" with download URL
11. UI polls for status and shows download button when ready

**Rate Limiting:**
- Database function `can_export_leads()` checks:
  - Last export must be > 10 minutes ago
  - Max 10 exports per day
- Rate limit tracked in `export_rate_limits` table

**Storage:**
- Files stored in `exports` bucket
- Path format: `exports/{export_id}.csv`
- Public URLs generated for download
- Files expire after 24 hours (enforced by `expires_at` column)

### 🚀 Setup Instructions

1. **Run Migration:**
   ```bash
   # Migration will create tables, functions, and storage bucket
   supabase migration up
   ```

2. **Set Up Cron Job:**
   - Add cron endpoint to your scheduler (e.g., Vercel Cron, Supabase Edge Functions)
   - Call `GET /api/cron/exports/worker` every minute

3. **Test Export:**
   - Navigate to `/contacts` page
   - Click "Export Leads" button
   - Select filters and generate export
   - Wait for processing (polls every 3 seconds)
   - Download CSV when ready

### 📝 Notes

- Email notifications when export is ready (TODO - can be added later)
- Worker processes up to 5 exports per run to avoid overload
- CSV files are stored temporarily (24 hour expiration)
- Export includes only data user has access to (RLS enforced)

### 🔄 Future Enhancements

- Email notification when export is ready
- Export history page
- Scheduled exports
- Export templates (save filter presets)
- Export to other formats (JSON, Excel)
