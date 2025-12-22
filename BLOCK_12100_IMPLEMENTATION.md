# Block 12100 — SmartSend User Roles & Multi-User Access v1

## Implementation Summary

This block implements a simple, effective multi-user access system for roofing companies with three roles: **Owner**, **Manager**, and **Staff**.

## Database Changes

### Migration: `20250130000001_block12100_user_roles_multi_user_access_v1.sql`

- Updated `users` table: Changed role constraint from `('owner', 'manager', 'viewer')` to `('owner', 'manager', 'staff')`
- Updated `user_invites` table: Changed role constraint to match
- Migrated existing 'viewer' roles to 'staff'
- Updated `can_user_perform_action()` function to use 'staff' role with simplified permissions
- Added `company_name` column to `billing_accounts` for invite emails
- Added trigger to ensure only one owner per account
- Updated permission initialization function

## API Routes

### Updated Routes
- `/api/settings/team/invite` - Now accepts 'staff' instead of 'viewer', sends invitation emails
- `/api/settings/team/list` - Returns team members with 'staff' role
- `/api/settings/team/remove` - Removes team members (owners only)
- `/api/settings/team/me` - Returns current user's role
- `/api/settings/permissions` - Updated to use 'staff' permissions

### New Routes
- `/api/invite/accept` - Accept invitation by token (GET for details, POST to accept)
- `/api/settings/team/change-role` - Change a team member's role (owners only)
- `/api/settings/team/resend-invite` - Resend an invitation email

## UI Components

### Updated
- `/app/(dashboard)/settings/team-v2/page.tsx` - Team settings page with 'staff' role support
  - Updated role selector to show "Manager" and "Staff" options
  - Simplified permissions UI (removed viewer-specific permissions)
  - Added role change dropdown for team members
  - Added "Resend Invite" button for pending invites
  - Updated type definitions

### New
- `/app/invite/page.tsx` - Invitation acceptance page
  - Shows company name and role
  - Accepts invitation and redirects to dashboard

## Permission System

### Roles & Permissions

#### Owner
- Full access to all features
- Billing access
- Domain settings
- Can add/remove staff
- Can change roles
- View everything

#### Manager
- Create/edit campaigns
- Import leads
- Assign tags
- View inbox + reply
- Manage lead statuses
- See dashboard + ROI
- View timeline
- View activity log
- Edit templates
- **Cannot** access billing
- **Cannot** remove Owner
- **Cannot** modify domain settings

#### Staff
- View inbox
- Reply to leads
- Update lead status
- View timeline
- See assigned lists (Hot Leads, Warm Leads, Follow Ups)
- **Cannot** create campaigns
- **Cannot** change settings
- **Cannot** access billing
- **Cannot** modify domain

### Permission Helpers

#### `lib/auth/requireAccountRole.ts`
- Updated to use 'staff' role
- `getAccountRole()` - Gets current user's role and account
- `requireAccountRole()` - Requires specific role(s)
- `canPerformAction()` - Checks if user can perform action
- `requireAction()` - Requires permission for action

#### `lib/auth/routePermissions.ts` (NEW)
- `hasRoutePermission()` - Check if role has permission for route
- `getAllowedRoutes()` - Get all allowed routes for role
- `canAccessRoute()` - Check if user can access route path
- `ROUTE_PERMISSIONS` - Map of routes to required permissions

## Invite Flow

1. Owner clicks "Invite Team Member" on `/settings/team`
2. Enters email and selects role (Manager or Staff)
3. System creates invite record with token
4. Email sent with invitation link: `/invite?token=xxx`
5. User clicks link, sees invitation details
6. User accepts (must be logged in with matching email)
7. User record created, invite marked as accepted
8. User redirected to dashboard with appropriate view

## Email Integration

Invitation emails are sent using the `sendMail` function from `lib/mailer.ts`:
- From: `process.env.FROM_EMAIL` or `noreply@smartsend.ai`
- Subject: `{company_name} invited you to SmartSend`
- Contains invitation link and expiration info

## Key Features

✅ Simple 3-role system (Owner, Manager, Staff)  
✅ One owner per account (enforced by trigger)  
✅ Email-based invitations  
✅ Role-based permission checks  
✅ Simplified permissions (no complex trees)  
✅ Staff view limited to inbox/replies/leads  
✅ Manager view includes campaigns but not billing  
✅ Owner has full control  

## Testing Checklist

- [ ] Owner can invite Manager
- [ ] Owner can invite Staff
- [ ] Invitation email is sent
- [ ] User can accept invitation
- [ ] Staff can view inbox but not campaigns
- [ ] Manager can create campaigns but not access billing
- [ ] Owner can change roles
- [ ] Owner can remove members
- [ ] Only one owner per account
- [ ] Account owner cannot be removed

## Features Implemented

✅ Database migration with role updates  
✅ API routes for team management  
✅ Invitation system with email sending  
✅ Invite acceptance flow  
✅ Role change functionality  
✅ Resend invite functionality  
✅ Permission helpers and route checking  
✅ Team settings UI with role management  

## Next Steps (Future Enhancements)

1. Update dashboard routes to check permissions using `routePermissions.ts` in middleware
2. Hide campaign builder UI for Staff role in frontend components
3. Hide billing/settings pages for Manager and Staff using route guards
4. Add role badges to user avatars throughout the app
5. Add activity log for role changes and team member actions
6. Add role-based navigation menu filtering
7. Add "Lock account" feature for future use
