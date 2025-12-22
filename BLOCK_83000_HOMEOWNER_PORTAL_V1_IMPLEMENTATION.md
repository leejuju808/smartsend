# Block 83000 — SmartSend Roofing "Homeowner Portal + Live Job Updates + Media Hub" v1

## ✅ Implementation Complete

All components for the homeowner portal system have been successfully implemented.

## 📦 What Was Built

### Database Migration
**File**: `supabase/migrations/20250130000001_block83000_homeowner_portal_v1.sql`

**Tables Created**:
- `homeowner_portals` - Portal links per job with secure tokens
- `homeowner_portal_events` - Timeline events (status updates, crew assignments, etc.)
- `homeowner_portal_files` - Documents (estimate, contract, warranty, etc.)
- `homeowner_feedback` - Feedback and review capture

**Functions Created**:
- `generate_portal_token()` - Generate secure portal tokens
- `auto_create_homeowner_portal()` - Auto-create portal when job status changes
- `auto_create_portal_event_on_status_change()` - Auto-create events on status changes
- `add_portal_event()` - Helper to add events from application code
- `add_portal_file()` - Helper to add files from application code

**Triggers**:
- Auto-creates portal when job status changes to `scheduled` or `in_progress`
- Auto-creates portal events when job status changes

### API Routes

**Internal (Authenticated)**:
- `POST /api/homeowner-portal/create` - Create portal for a job
- `GET /api/homeowner-portal/[jobId]` - Get portal for a job
- `PUT /api/homeowner-portal/[jobId]` - Update portal (toggle active, update homeowner info)
- `POST /api/homeowner-portal/[jobId]/events` - Add event to portal timeline
- `POST /api/homeowner-portal/[jobId]/files` - Add file to portal
- `POST /api/homeowner-portal/integration` - Integration helper for auto-creating events

**Public (Token-Based)**:
- `GET /api/portal/[token]` - Get portal data (status, timeline, photos, documents)
- `POST /api/portal/[token]/feedback` - Submit feedback/review

### UI Components

**Internal Dashboard**:
- `app/dashboard/homeowner-portal/page.tsx` - Manage portals per job
  - View all jobs and their portal status
  - Create portals with one click
  - Toggle portal active/inactive
  - Copy portal link
  - View as homeowner (preview)
  - Send portal link via email

**Public Portal**:
- `app/portal/[token]/page.tsx` - Homeowner-facing portal
  - Live status banner (Scheduled, In Progress, Completed)
  - Job timeline with events
  - Photo gallery (Before, Damage, During, After) with category filters
  - Document center (download estimates, contracts, warranties)
  - Feedback form (rating 1-5, comment, review opt-in)

## 🚀 Quick Start

### 1. Apply Database Migration

```bash
# Apply the migration via Supabase Dashboard → SQL Editor
# Or via Supabase CLI:
supabase db push
```

### 2. Access Internal Dashboard

Navigate to `/dashboard/homeowner-portal` to:
- View all jobs
- Create portals for jobs
- Manage portal links
- Send links to homeowners

### 3. Portal Auto-Creation

Portals are automatically created when:
- Job status changes to `scheduled` or `in_progress`
- Portal doesn't already exist

### 4. Integration with Existing Systems

**Crew Assignment**:
```typescript
// When crew is assigned
await fetch('/api/homeowner-portal/integration', {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobId,
    event_type: 'crew_assigned',
    title: 'Crew Assigned',
    description: 'Crew 1 has been assigned to your project'
  })
});
```

**Crew Status Updates**:
```typescript
// When crew status changes
await fetch('/api/homeowner-portal/integration', {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobId,
    event_type: 'crew_en_route',
    title: 'Crew En Route',
    description: 'Your crew is on the way'
  })
});
```

**Photo Uploads**:
```typescript
// After photos are uploaded
await fetch('/api/homeowner-portal/integration', {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobId,
    event_type: 'photo_added',
    title: 'New Photos Added',
    description: 'New photos have been added to your gallery'
  })
});
```

**Documents**:
```typescript
// When sending estimate/contract/warranty
await fetch(`/api/homeowner-portal/${jobId}/files`, {
  method: 'POST',
  body: JSON.stringify({
    file_url: 'https://...',
    label: 'Estimate',
    file_name: 'estimate.pdf',
    file_size: 12345
  })
});

await fetch('/api/homeowner-portal/integration', {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobId,
    event_type: 'estimate_sent',
    title: 'Estimate Sent',
    description: 'Your estimate has been sent'
  })
});
```

## 📋 Features

### ✅ One-Click Portal Creation
- Create portal for any job with one click
- Auto-generated secure token (12 characters)
- No login required for homeowners

### ✅ Live Status Banner
- Shows current job status (Scheduled, In Progress, Completed)
- Color-coded status chips
- Next steps messaging

### ✅ Job Timeline
- Chronological event feed
- Auto-populated from job status changes
- Manual events can be added
- Shows: Estimate Sent, Crew Assigned, Crew En Route, On Site, Photos Added, Job Completed

### ✅ Photo Gallery
- Pulls from `site_photos` or `job_field_photos` tables
- Category filters: All, Before, Damage, During, After
- Click to enlarge
- Responsive grid layout

### ✅ Document Center
- Upload and share: Estimates, Contracts, Warranties, Change Orders, Scope of Work
- One-click download
- Organized by label

### ✅ Feedback & Review Capture
- 1-5 star rating
- Comment box
- Opt-in for review link
- Only shown when job is completed
- Feeds into review engine (future block)

## 🔒 Security

- **Token-Based Access**: No login required, secure random tokens
- **RLS Policies**: Public read for portal data, authenticated write for management
- **Workspace Isolation**: Portals are scoped to workspaces
- **Token Validation**: Tokens are validated on every request

## 🎯 Revenue Impact

This feature directly drives revenue by:
- **Higher close rate**: Portal link in estimate email makes you look professional
- **Fewer cancellations**: Homeowners see clear progress
- **Fewer disputes**: Photos + timeline = proof
- **More referrals**: Homeowners show portal + photos to friends/neighbors
- **More reviews**: Feedback capture feeds review engine
- **Higher pricing power**: You look like a $10M+ company

## 📝 Next Steps

1. **Apply Migration**: Run the SQL migration in Supabase
2. **Test Portal Creation**: Create a portal for a test job
3. **Send Test Link**: Copy portal link and test in incognito mode
4. **Integrate Events**: Add integration calls to crew assignment, photo uploads, etc.
5. **Customize Branding**: Add company logo/colors to portal (future enhancement)

## 🔗 Related Blocks

- **Block 82000**: Site photos (reused for gallery)
- **Block 22270**: Job creation (triggers portal creation)
- **Block 24380**: Crew assignments (integrate events)
- **Future**: Review engine (uses feedback data)

---

**Status**: ✅ Complete and ready for deployment



























