# Block 22790 — SmartSend Roofing Homeowner Portal v1 Implementation

## ✅ Implementation Complete

The homeowner portal feature has been successfully implemented, providing a customer-facing experience for homeowners to view their job status, photos, notes, and next steps without requiring authentication.

## 📦 What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250130000001_block22790_homeowner_portal_v1.sql`

- Created `homeowner_portals` table with:
  - `id` (uuid, primary key)
  - `workspace_id` (references workspaces)
  - `job_id` (references roofing_jobs)
  - `portal_token` (unique secure token, 32-48 chars)
  - `is_enabled` (boolean, default true)
  - `created_at` (timestamptz)

- Row Level Security (RLS) policies:
  - Users can view/create/update portals for jobs in their workspace
  - Public read access for edge function (no auth required)

### 2. Edge Function
**File:** `supabase/functions/homeowner-portal-data/index.ts`

- Endpoint: `/homeowner/portal-data`
- Accepts: `{ portal_token: string }`
- Returns homeowner-safe data:
  - Job info (name, address, status, progress_percent, crew_name)
  - Field photos (filtered to only show "before", "during", "after" tags)
  - Field notes (filtered to only show "progress" and "general" note types)
  - Next scheduled steps from production calendar

- Security:
  - Validates portal token
  - Checks if portal is enabled
  - Filters out internal/private data
  - Returns public photo URLs from Supabase Storage

### 3. Frontend Portal Page
**File:** `app/homeowner/[token]/page.tsx`

- Public page accessible at `/homeowner/[token]`
- No authentication required
- Fetches data from edge function
- Displays:
  - Job header with name, address, status badge
  - Progress bar
  - Photo gallery (grouped by before/during/after)
  - Daily updates feed
  - Next steps card
  - Footer branding

### 4. UI Components

#### JobHeader (`components/JobHeader.tsx`)
- Displays job name, address, status badge
- Shows crew name if available
- Status color coding (green=completed, blue=in_progress, yellow=scheduled)

#### PhotoGallery (`components/PhotoGallery.tsx`)
- Groups photos by tag (before → during → after)
- Grid layout with click-to-expand modal
- Full-screen photo viewer with navigation arrows
- Shows photo captions and dates

#### NotesFeed (`components/NotesFeed.tsx`)
- Displays homeowner-safe field notes
- Shows date/time for each note
- Timeline-style layout

#### NextStepCard (`components/NextStepCard.tsx`)
- Shows next scheduled production slot
- Displays date, time range, crew name
- Highlights "Today" or "Tomorrow" labels

#### FooterBranding (`components/FooterBranding.tsx`)
- Simple footer with SmartSend branding

## 🔧 Setup Instructions

### 1. Run Database Migration

```bash
# Via Supabase Dashboard SQL Editor
# Paste contents of: supabase/migrations/20250130000001_block22790_homeowner_portal_v1.sql
# Click "Run"
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy homeowner-portal-data
```

### 3. Configure Environment Variables

Ensure these are set in Supabase Dashboard → Edge Functions → Settings:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 4. Create Portal Links

To create a portal link for a job, insert a record into `homeowner_portals`:

```sql
INSERT INTO homeowner_portals (workspace_id, job_id, portal_token, is_enabled)
VALUES (
  'your-workspace-id',
  'your-job-id',
  gen_random_uuid()::text || substr(md5(random()::text), 1, 16), -- 32+ char token
  true
)
RETURNING portal_token;
```

Or via application code:
```typescript
const token = crypto.randomUUID() + '-' + Math.random().toString(36).substring(2, 18);
const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/homeowner/${token}`;
```

## 🎯 Usage

### For Contractors

1. **Create Portal Link**: Generate a unique token and insert into `homeowner_portals` table
2. **Share Link**: Send homeowner the link: `https://yourdomain.com/homeowner/[token]`
3. **Manage Access**: Set `is_enabled = false` to disable a portal

### For Homeowners

1. **Click Link**: Open the portal link sent by contractor
2. **View Status**: See job progress, photos, and updates
3. **No Login Required**: Portal is accessible via secure token only

## 🔒 Security Features

- **Token-based Access**: No authentication required, uses secure random tokens
- **Data Filtering**: Only homeowner-safe data is exposed:
  - Photos: Only "before", "during", "after" tags (no internal/safety photos)
  - Notes: Only "progress" and "general" types (no internal issues)
- **RLS Policies**: Database-level security ensures users can only manage portals for their workspace
- **Portal Disabling**: Can disable portals by setting `is_enabled = false`

## 📱 Mobile-Friendly

The portal is designed to be mobile-first:
- Responsive grid layouts
- Touch-friendly photo gallery
- Optimized for phone screens
- Fast loading with lazy image loading

## 🚀 Next Steps (Future Enhancements)

- Password protection (optional in V1, mentioned in spec)
- Document access (estimates, warranties, invoices)
- E-signature integration (Block 22830)
- Email notifications when portal updates
- Portal analytics (views, engagement)

## 📝 Notes

- Portal tokens should be 32-48 characters for security
- Photos are served from Supabase Storage bucket `field-photos`
- Production slots come from `job_production_slots` table
- Field photos and notes come from `job_field_photos` and `job_field_notes` tables







































