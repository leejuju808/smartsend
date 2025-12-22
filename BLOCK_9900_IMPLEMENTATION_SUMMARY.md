# Block 9900 — Settings & Permissions v1 Implementation Summary

## Overview
Implemented a foundational team and permissions system for SmartSend based on `billing_accounts`. This enables roofing companies to manage their account, add team members, and control access to features.

## What Was Implemented

### 1. Database Schema ✅
**File:** `supabase/migrations/20250130000002_block9900_settings_permissions_v1.sql`

- **`users` table**: Team members linked to `billing_accounts`
  - Links to `auth.users` via `auth_user_id`
  - Roles: `owner`, `manager`, `viewer`
  - Unique constraint on `(account_id, email)`

- **`user_invites` table**: Pending invitations
  - Token-based invite system
  - 7-day expiration
  - Links to `billing_accounts` and `users` (inviter)

- **Permission settings**: Stored in `billing_accounts.meta.permissions`
  - `manager_can_send`: Allow managers to send campaigns
  - `viewer_can_update_pipeline`: Allow viewers to update pipeline stages
  - `viewer_can_see_revenue_dashboard`: Allow viewers to see revenue dashboard

- **RLS Policies**: Row-level security for both tables
- **Helper Functions**: 
  - `get_user_account_role()`: Get user's account and role
  - `can_user_perform_action()`: Check if user can perform action

### 2. Backend Role Enforcement ✅
**File:** `lib/auth/requireAccountRole.ts`

- `getAccountRole()`: Get current user's role and account
- `requireAccountRole()`: Require specific roles
- `canPerformAction()`: Check action permissions
- `requireAction()`: Require ability to perform action

### 3. API Routes ✅

#### Team Management
- **POST** `/api/settings/team/invite` - Invite team member (owner only)
- **GET** `/api/settings/team/list` - List members and invites
- **DELETE** `/api/settings/team/remove` - Remove team member (owner only)
- **DELETE** `/api/settings/team/invites/[id]` - Cancel invite (owner only)
- **GET** `/api/settings/team/me` - Get current user's role

#### Permissions
- **GET** `/api/settings/permissions` - Get account permissions
- **PATCH** `/api/settings/permissions` - Update permissions (account owner only)

#### Invite Acceptance
- **GET** `/api/invite/accept?token=xxx` - Get invite details
- **POST** `/api/invite/accept` - Accept invite and create account

### 4. Frontend UI ✅

#### Team Settings Page
**File:** `app/(dashboard)/settings/team-v2/page.tsx`

- View team members with roles
- Invite new members (owner only)
- View pending invites
- Remove members (owner only)
- Permission toggles:
  - Managers can send campaigns
  - Viewers can update pipeline
  - Viewers can see revenue dashboard

#### Invite Acceptance Page
**File:** `app/invite/page.tsx`

- Accept invite with token
- Create account or sign in
- Handle expired invites
- Redirect to dashboard after acceptance

## Role Permissions Matrix

| Action | Owner | Manager | Viewer |
|--------|-------|---------|--------|
| Manage account settings | ✅ | ❌ | ❌ |
| Manage billing | ✅ (account owner only) | ❌ | ❌ |
| Create/edit campaigns | ✅ | ✅ | ❌ |
| Send campaigns | ✅ | ✅* | ❌ |
| Edit templates | ✅ | ✅ | ❌ |
| View campaigns/leads | ✅ | ✅ | ✅ |
| Update pipeline stage | ✅ | ✅ | ✅* |
| View revenue dashboard | ✅ | ✅ | ✅* |
| Invite/remove users | ✅ (account owner only) | ❌ | ❌ |

* = Depends on account permission settings

## Next Steps (Not Yet Implemented)

### 1. Update Campaign Routes
Apply role enforcement to:
- `app/api/campaigns/route.ts` - Create campaign (owner/manager)
- `app/api/campaigns/[id]/send/route.ts` - Send campaign (owner, or manager if `manager_can_send`)
- Campaign editing routes

### 2. Update Template Routes
Apply role enforcement to:
- `app/api/templates/create/route.ts` - Create template (owner/manager)
- `app/api/templates/[id]/route.ts` - Edit template (owner/manager)

### 3. Update Other Routes
- Revenue dashboard routes (check `view_revenue_dashboard` permission)
- Pipeline update routes (check `update_pipeline` permission)
- Billing routes (owner only)

### 4. Settings Navigation
Create a main settings page that links to:
- Account settings
- Team settings
- Notifications
- Permissions
- Billing

### 5. Email Integration
- Send invitation emails (currently returns token in response)
- Use email service to send invite links

## Testing Checklist

- [ ] Owner can invite manager
- [ ] Manager can create campaigns
- [ ] Manager cannot access billing
- [ ] Manager can send campaigns (if permission enabled)
- [ ] Viewer can view campaigns but not edit
- [ ] Viewer can update pipeline (if permission enabled)
- [ ] Invite acceptance flow works
- [ ] Permission toggles work
- [ ] Seat limits are enforced

## Files Created/Modified

### New Files
1. `supabase/migrations/20250130000002_block9900_settings_permissions_v1.sql`
2. `lib/auth/requireAccountRole.ts`
3. `app/api/settings/team/invite/route.ts`
4. `app/api/settings/team/list/route.ts`
5. `app/api/settings/team/remove/route.ts`
6. `app/api/settings/team/invites/[id]/route.ts`
7. `app/api/settings/team/me/route.ts`
8. `app/api/settings/permissions/route.ts`
9. `app/api/invite/accept/route.ts`
10. `app/invite/page.tsx`
11. `app/(dashboard)/settings/team-v2/page.tsx`

### Modified Files
None (this is a new feature)

## Notes

- The system uses `billing_accounts` as the primary account entity
- Account owner is determined by `billing_accounts.user_id`
- Team members are stored in `users` table linked to `billing_accounts`
- Invites expire after 7 days
- Permission settings are stored in `billing_accounts.meta.permissions`
- RLS policies ensure users can only access their account's data

## Migration Notes

After running the migration:
1. Existing `billing_accounts` will have owner users created automatically
2. Default permissions are initialized:
   - `manager_can_send`: false
   - `viewer_can_update_pipeline`: true
   - `viewer_can_see_revenue_dashboard`: false
























































