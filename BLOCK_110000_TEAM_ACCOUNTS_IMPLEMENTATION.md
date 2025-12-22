# Block 110000 — Team Accounts + Crew Manager + Permissions System v1

## Implementation Summary

This block implements a comprehensive team management system for roofing companies, enabling multiple users per company with role-based permissions, lead assignment, crew management, and activity tracking.

## ✅ Completed Components

### 1. Database Schema (Migration)

**File:** `supabase/migrations/20250131000000_block110000_team_accounts_permissions_v1.sql`

#### Tables Created:
- **`role_permissions`** - Defines permissions for each role (owner, admin, sales, estimator, production)
- **`roofing_team_invites`** - Handles team member invitations
- **`crew_assignments`** - Assigns jobs to crews with scheduling
- **`team_activity`** - Activity log for team member actions

#### Tables Enhanced:
- **`leads`** - Added `assigned_to` column for lead assignment
- **`crews`** - Added `roofing_company_id` column to link crews to companies

#### Functions Created:
- **`user_has_permission()`** - Check if user has a specific permission
- **`get_user_company_role()`** - Get user's role in a company
- **`log_lead_assignment()`** - Trigger function to log lead assignments

#### Permissions Seeded:
- **owner**: Full access (all permissions)
- **admin**: Full access (all permissions)
- **sales**: Can view leads, send emails
- **estimator**: Can view leads, assign jobs
- **production**: Can assign jobs, manage crews

### 2. API Routes

#### Team Invite System
- **`POST /api/team/invite`** - Invite a user to a roofing company
- **`GET /api/team/accept?token=xxx`** - Get invite details
- **`POST /api/team/accept`** - Accept an invite and join company

#### Team Leads Management
- **`GET /api/team/leads`** - Get leads for company with filters (hot, warm, needs_followup)
- **`PATCH /api/team/leads/[id]/assign`** - Assign/unassign a lead to a team member

#### Crew Manager
- **`GET /api/team/crews`** - Get crews for a company
- **`POST /api/team/crews`** - Create a new crew
- **`GET /api/team/crews/assign`** - Get crew assignments
- **`POST /api/team/crews/assign`** - Assign a job to a crew

### 3. Permission System

**File:** `lib/permissions/block110000.ts`

Functions:
- `checkPermission()` - Check if user has a specific permission
- `getUserCompanyRole()` - Get user's role in a company
- `isOwnerOrAdmin()` - Check if user is owner or admin
- `requirePermission()` - Middleware helper for permission checks
- `getUserPermissions()` - Get all permissions for a user

### 4. UI Components

**File:** `app/(dashboard)/team/leads/page.tsx`

Team Leads Inbox page with:
- Lead list with assignment status
- Filters: All, Hot, Warm, Needs Follow-up
- Assignment filter: All, Me, Unassigned, or specific team member
- Quick assignment dropdown for each lead
- Team member display

## 🔧 How It Works

### Invite Flow

1. Owner/Admin calls `POST /api/team/invite` with email and role
2. System creates invite in `roofing_team_invites` table with token
3. Invite link sent: `/team/accept?token=xxx`
4. User clicks link, signs up/signs in
5. User calls `POST /api/team/accept` with token
6. System adds user to `roofing_company_members` table
7. User can now access company resources based on role

### Lead Assignment

1. User with `can_view_leads` permission can view leads
2. Owners/Admins can assign leads to any team member
3. Others can only assign leads to themselves
4. Assignment updates `leads.assigned_to` column
5. Activity is logged in `team_activity` table

### Crew Management

1. Production managers (or above) can create crews
2. Crews are linked to roofing companies via `roofing_company_id`
3. Jobs can be assigned to crews via `crew_assignments` table
4. Assignments include scheduled date, times, and notes

### Permission Enforcement

All API routes check permissions using:
```typescript
const hasPermission = await checkPermission(company_id, user_id, 'can_view_leads');
```

Database RLS policies enforce access at the database level.

## 📋 Next Steps (Optional Enhancements)

1. **Email Integration** - Send actual invitation emails (currently returns invite link)
2. **Crew Manager UI** - Create UI page for managing crews and assignments
3. **Activity Dashboard** - Create dashboard showing team activity metrics
4. **Notification System** - Notify users when leads are assigned to them
5. **Bulk Actions** - Allow bulk assignment of leads
6. **Lead Heat Scoring** - Integrate with existing heat scoring system
7. **Mobile App** - Add crew assignment features to mobile app

## 🔐 Security Notes

- All API routes require authentication
- Permissions are checked at both API and database (RLS) levels
- Invite tokens expire after 7 days
- Only owners/admins can invite team members
- Only owners/admins can assign leads to others
- Activity logging tracks all assignments for audit

## 📊 Database Schema Overview

```
roofing_companies (existing)
  └── roofing_company_members (existing)
      └── role_permissions (new)
      └── roofing_team_invites (new)
      └── team_activity (new)

leads (existing)
  └── assigned_to (new column)

crews (existing)
  └── roofing_company_id (new column)
  └── crew_assignments (new)

roofing_jobs (existing)
  └── crew_assignments.roofing_job_id (new)
```

## 🎯 Key Features Delivered

✅ Multiple users per roofing company  
✅ Role-based permissions (owner, admin, sales, estimator, production)  
✅ Team invite system with email tokens  
✅ Lead assignment to team members  
✅ Team inbox with filters  
✅ Crew Manager for job assignments  
✅ Activity tracking for team oversight  
✅ Permission middleware for access control  

This system transforms SmartSend from a single-user tool into a multi-user business management platform, enabling entire roofing companies to collaborate effectively.


























