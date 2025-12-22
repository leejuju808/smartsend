# Block 20840 — SmartSend Roofing Team Permissions v1

## Implementation Summary

This block implements role-based access control (RBAC) for roofing teams, making SmartSend feel like a real system a roofing company can run a team on, not just a solo tool.

## Database Schema

### New Role Enum
- `roofing_team_role`: `OWNER`, `SALES_REP`, `OFFICE_STAFF`, `ADJUSTER_HELPER`

### Updated Tables
- `org_memberships`: Added `roofing_role` column (defaults to `SALES_REP`)
- `leads`: Added `assigned_user_id` column for sales rep assignment
- `roofing_jobs`: Added `assigned_user_id` column (synced from leads)

### Permission Helper Functions
- `get_user_roofing_role(p_org_id)` - Get current user's role
- `can_view_lead(p_lead_id)` - Check if user can view a lead
- `can_send_proposal(p_thread_id)` - Check if user can send proposals
- `can_send_adjuster_email(p_thread_id)` - Check if user can send adjuster emails (OWNER only)
- `can_update_job_stage(p_job_id)` - Check if user can update job stage
- `can_view_revenue_dashboard(p_org_id)` - Check if user can view revenue dashboard (OWNER only)
- `can_manage_team(p_org_id)` - Check if user can manage team (OWNER only)
- `can_manage_billing(p_org_id)` - Check if user can manage billing (OWNER only)

## Permission Matrix

### 🟣 OWNER
- ✅ View ALL leads, jobs, inbox threads
- ✅ View + edit Insurance Brain fields
- ✅ Generate + send estimates and proposals
- ✅ Send adjuster emails
- ✅ Change job stages
- ✅ Access Revenue Dashboard
- ✅ View & edit Calendar
- ✅ Invite / remove team members
- ✅ Change roles
- ✅ Manage subscription + billing
- ✅ View all notifications

### 🟢 SALES_REP
- ✅ View their assigned leads & jobs
- ✅ View inbox threads for those leads only
- ✅ See insurance summary (carrier, status, deductible, RCV)
- ✅ View scope summary + estimate amounts
- ✅ Generate & send proposals to homeowners
- ✅ Trigger follow-up sequences
- ✅ Move job stage for their own leads
- 🚫 No Billing access
- 🚫 No team management
- 🚫 No editing other reps' jobs
- 🚫 No editing company-wide settings

### 🟡 OFFICE_STAFF
- ✅ View ALL leads & inbox
- ✅ See insurance / claim summary (read-only)
- ✅ Schedule installs (Calendar)
- ✅ Create follow-up reminders
- ✅ Update job stage to: SCHEDULED_INSTALL, COMPLETED (with notes)
- ✅ Send homeowner emails using generated templates
- 🚫 Cannot change AI estimate numbers
- 🚫 Cannot change proposal pricing
- 🚫 Cannot send adjuster supplement/pricing dispute emails (view-only)
- 🚫 No Billing
- 🚫 No team management

### 🔵 ADJUSTER_HELPER
- ✅ View ALL leads with claims
- ✅ View Insurance Brain + Claim Timeline
- ✅ View parsed scopes & line items
- ✅ Draft adjuster emails: supplements, follow-ups, pricing disputes
- ✅ Mark which supplements are sent
- 🚫 Cannot send proposals to homeowners
- 🚫 Cannot edit estimates or job pricing
- 🚫 Cannot manage calendar
- 🚫 Cannot access Billing
- 🚫 Cannot invite/remove team

## API Routes Updated

### Permission Enforcement Added
1. **POST `/api/inbox/adjuster/send`**
   - Checks `can_send_adjuster_email()` - OWNER only

2. **POST `/api/inbox/proposals/[id]/email/send`**
   - Checks `can_send_proposal()` - OWNER and SALES_REP (if assigned)

3. **PATCH `/api/inbox/revenue/threads/[threadId]/pipeline`**
   - Checks `can_view_lead()` before allowing pipeline stage updates

### New API Routes
1. **GET `/api/settings/team/roofing/list`**
   - Lists team members with roofing roles

2. **POST `/api/settings/team/roofing/invite`**
   - Invites team member with roofing role (OWNER only)

3. **POST `/api/settings/team/roofing/update-role`**
   - Updates team member's roofing role (OWNER only)

## UI Components

### New Team Settings Page
- **Route**: `/settings/team-roofing`
- **File**: `app/(dashboard)/settings/team-roofing/page.tsx`
- Features:
  - Role selector with descriptions
  - Invite team members with roofing roles
  - Update roles (OWNER only)
  - View pending invites

## Migration File

**File**: `supabase/migrations/20250201000007_block20840_team_permissions_v1.sql`

### Key Changes
1. Creates `roofing_team_role` enum
2. Adds `roofing_role` column to `org_memberships`
3. Migrates existing roles to roofing roles
4. Adds `assigned_user_id` to `leads` and `roofing_jobs`
5. Creates permission helper functions
6. Adds trigger to sync `assigned_user_id` from leads to jobs

## Next Steps (Future Blocks)

### Block 20870 — SmartSend Roofing Login & Session Guard v1
- Secure org login
- Seat awareness
- "Who am I" context for all actions
- Ensure all actions have `user_id + organization_id`
- Tie activity feed, notifications, and assignments to specific people

## Testing Checklist

- [ ] Test OWNER can view all leads
- [ ] Test SALES_REP can only view assigned leads
- [ ] Test SALES_REP can send proposals for assigned leads
- [ ] Test SALES_REP cannot send adjuster emails
- [ ] Test OFFICE_STAFF can view all leads but cannot change pricing
- [ ] Test ADJUSTER_HELPER can draft adjuster emails but cannot send proposals
- [ ] Test role changes via team settings page
- [ ] Test invite flow with roofing roles
- [ ] Test permission checks in API routes
- [ ] Test lead assignment syncs to roofing_jobs

## Notes

- Role enforcement is primarily at the API layer for flexibility
- Database functions provide reusable permission checks
- UI visibility controls can be added based on user role (future enhancement)
- Lead assignment is key for SALES_REP role filtering
- Owner role cannot be changed by self (prevents lockout)
















































