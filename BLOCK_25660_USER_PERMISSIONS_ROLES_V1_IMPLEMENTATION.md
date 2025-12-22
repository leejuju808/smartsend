# Block 25660 — SmartSend Roofing User Permissions & Roles v1 Implementation

## Overview

This implementation delivers **THE PERMISSIONS + ROLES SYSTEM — ZERO FLUFF** for SmartSend Roofing. This is where SmartSend stops being "a tool" and becomes a real roofing company operating system because every role sees EXACTLY what they need — nothing more, nothing less.

## Problem Solved

Roofers suffer MASSIVE problems right now because:
- ❌ crews see things they shouldn't
- ❌ sales reps accidentally delete or change data
- ❌ homeowners get wrong info
- ❌ insurance coordinators alter job notes
- ❌ ops manager changes pricing by mistake
- ❌ nobody knows who touched what
- ❌ ZERO accountability
- ❌ NO audit trails
- ❌ PO's get overridden
- ❌ sensitive documents exposed
- ❌ permissions are chaos

**SmartSend Roofing User Permissions & Roles v1 solves all of this.**

## What Was Built

### 1. Core Roles System

#### Roofing-Specific Roles Enum
Created `roofing_role` enum with 6 roles:
- `admin` - Owner (Full Access)
- `ops_manager` - Operations Manager
- `sales_rep` - Sales Rep
- `insurance_specialist` - Insurance Specialist
- `crew_leader` - Crew Leader
- `homeowner_portal` - Read-Only Homeowner Portal

#### Extended workspace_members Table
- Added `roofing_role` column to `workspace_members`
- Migrated existing roles: `owner` → `admin`, `admin` → `admin`, `member` → `sales_rep`
- Created index for fast role lookups

### 2. Permissions System

#### Permissions Table
Created `roofing_permissions` table with granular permissions:
- **Jobs**: view_all, view_assigned, view_today, create, edit, edit_pricing, edit_status, delete, approve, schedule, assign_crew
- **Financials**: view, view_margins, view_costs, edit
- **Documents**: view_all, view_assigned, upload, edit, delete
- **Leads & Sales**: view_all, view_assigned, create, edit, delete
- **Quotes**: create, send, edit_pricing
- **Insurance**: view, edit, upload_docs, track_acv, track_depreciation, submit_supplements
- **Crew & Operations**: view, assign, view_pay, edit_pay
- **Materials**: view, order, track
- **Photos**: view_all, view_assigned, upload, delete
- **Tasks**: view_all, view_assigned, create, complete, delete
- **Settings & Users**: view, edit, invite, delete
- **Homeowner Contact**: view_contact, view_limited
- **Notes**: view_all, view_assigned, create, edit, delete
- **Audit & Reporting**: view, view_all, view_assigned

#### Role-Permission Mapping
Created `role_permissions` table mapping each role to its granted permissions:

**Admin**: All permissions granted ✅

**Ops Manager**: 
- View all jobs, edit (except pricing)
- View all documents, upload, edit
- View materials, order, track
- View crew, assign crews
- View all photos, upload
- View all tasks, create, complete
- View limited homeowner info
- View all notes, create, edit
- View all reports

**Sales Rep**:
- View assigned leads, create, edit
- Create quotes, send quotes
- View assigned jobs, create, edit
- View assigned documents, upload
- View assigned photos, upload
- View assigned tasks, create, complete
- View homeowner contact info
- View assigned notes, create, edit
- View assigned reports
- ❌ Cannot see profit, costs, other reps' jobs, accounting

**Insurance Specialist**:
- View all jobs, edit
- View/edit insurance data
- Upload insurance docs
- Track ACV, depreciation
- Submit supplements
- View all documents, upload, edit
- View all photos, upload
- View homeowner contact
- View all notes, create, edit
- View all reports
- ❌ Cannot modify pricing, schedule installs, change material lists, adjust crew pay

**Crew Leader**:
- View today/tomorrow's assigned jobs
- View assigned documents, upload photos
- View assigned photos, upload photos
- View assigned tasks, complete tasks
- View limited homeowner info (first name only)
- ❌ Cannot see pricing, margins, homeowner contact info, job notes from other teams, other jobs

**Homeowner Portal**:
- View assigned jobs (read-only)
- View assigned documents (read-only)
- View assigned photos (read-only)
- ❌ Cannot edit anything, see internal notes, see profit, see crew info other than first name

### 3. Audit Logs System

#### Audit Logs Table
Created `roofing_audit_logs` table tracking:
- **Who**: user_id, user_email, user_role
- **What**: resource_type, resource_id, action, field_name
- **Change Details**: old_value, new_value, change_summary
- **Device & Context**: device_type, ip_address, user_agent
- **When**: created_at timestamp

#### Audit Triggers
Created triggers on key tables:
- `roofing_jobs` - Tracks status changes, pricing changes, scheduling, crew assignments
- `job_documents` - Tracks document uploads, edits, deletions
- `leads` - Tracks lead creation, updates, deletions

**Example Audit Log Entry**:
```
"Sales rep changed shingle color"
"Ops updated install date"
"Insurance team added supplement"
"Crew uploaded decking photos"
```

### 4. Helper Functions

#### `has_permission(permission_key, workspace_id)`
Checks if current user has a specific permission. Returns boolean.

#### `get_user_roofing_role(workspace_id, user_id)`
Gets user's roofing role for a workspace.

#### `can_view_job(job_id)`
Checks if user can view a specific job based on their role and assignment.

### 5. Row-Level Security (RLS) Policies

#### roofing_jobs
- **Admin**: Full access (all operations)
- **Ops Manager**: View all, edit (cannot change pricing)
- **Sales Rep**: View/edit assigned leads' jobs (cannot change pricing or status beyond sales stages)
- **Insurance Specialist**: View all, edit (cannot change pricing, scheduling, crew)
- **Crew Leader**: View only today/tomorrow's assigned jobs, can update status and notes
- **Homeowner Portal**: Read-only view of their jobs

#### job_documents
- **Admin**: Full access
- **Ops Manager**: View all, upload, edit (no delete)
- **Sales Rep**: View/upload for assigned jobs
- **Insurance Specialist**: View all, upload insurance docs
- **Crew Leader**: View/upload photos for assigned jobs (today/tomorrow only)
- **Homeowner Portal**: Read-only view (excludes internal notes)

#### leads
- **Admin**: Full access
- **Ops Manager**: View all leads
- **Sales Rep**: View/edit only assigned leads
- **Insurance Specialist**: View all leads (for insurance context)
- **Crew Leader**: No access

#### proposals
- **Admin**: Full access
- **Ops Manager**: View all (read-only)
- **Sales Rep**: View/edit proposals for assigned leads
- **Insurance Specialist**: View all (read-only)

#### roofing_tasks
- **Admin**: Full access
- **Ops Manager**: View all tasks, create/edit/complete
- **Sales Rep**: View/complete assigned tasks
- **Insurance Specialist**: View all tasks, create/edit insurance-related tasks
- **Crew Leader**: View/complete assigned tasks for today's jobs

### 6. Role-Specific Dashboard Views

#### Owner Dashboard (`owner_dashboard`)
- Total jobs
- Jobs in progress
- Jobs scheduled
- Total revenue
- Total deposits
- Total leads
- Team size

#### Ops Manager Dashboard (`ops_dashboard`)
- Today's installs
- Tomorrow's installs
- Delayed jobs
- Active jobs

#### Sales Rep Dashboard (`sales_dashboard`)
- Hot leads
- Quotes sent
- Closed leads
- Close rate

#### Insurance Dashboard (`insurance_dashboard`)
- Insurance jobs count
- Pending ACV
- Pending supplements

#### Crew Leader Dashboard (`crew_leader_dashboard`)
- Today's jobs
- Tomorrow's jobs
- Photos uploaded today

#### Homeowner Dashboard (`homeowner_dashboard`)
- My jobs
- Total photos
- Invoices
- Warranties

## Key Features

### 1. Zero Fluff Permissions
Each role has EXACTLY the permissions they need — nothing more, nothing less.

### 2. Complete Audit Trail
Every change is logged with:
- Who made it
- When it happened
- What changed (before/after values)
- From which device
- User's role at the time

### 3. Protected Sensitive Data
- Crew leaders cannot see pricing, margins, or homeowner contact info
- Sales reps cannot see other reps' jobs or financial data
- Ops managers cannot change pricing
- Insurance specialists cannot modify scheduling or crew assignments

### 4. Role-Based Dashboards
Each role sees a custom dashboard with only relevant information.

### 5. Accountability
If someone makes a mistake, the owner knows EXACTLY who did it and when.

## Database Schema

### New Tables
1. `roofing_permissions` - Granular permissions
2. `role_permissions` - Maps roles to permissions
3. `roofing_audit_logs` - Complete audit trail

### Modified Tables
1. `workspace_members` - Added `roofing_role` column

### New Types
1. `roofing_role` - Enum with 6 roofing-specific roles

### New Functions
1. `has_permission(permission_key, workspace_id)` - Permission check
2. `get_user_roofing_role(workspace_id, user_id)` - Get user role
3. `can_view_job(job_id)` - Job visibility check
4. `log_audit_change()` - Audit trigger function

### New Views
1. `owner_dashboard` - Owner metrics
2. `ops_dashboard` - Operations metrics
3. `sales_dashboard` - Sales metrics
4. `insurance_dashboard` - Insurance metrics
5. `crew_leader_dashboard` - Crew metrics
6. `homeowner_dashboard` - Homeowner view

## Migration File

**File**: `supabase/migrations/20250130000001_block25660_user_permissions_roles_v1.sql`

This migration:
1. Creates roofing roles enum
2. Extends workspace_members with roofing_role
3. Creates permissions system
4. Seeds role-permission mappings
5. Creates audit logs table
6. Creates helper functions
7. Creates audit triggers
8. Implements RLS policies for all major tables
9. Creates role-specific dashboard views

## How This Makes SmartSend Unreplaceable

Once SmartSend:
- Controls access
- Structures every role
- Prevents mistakes
- Organizes the entire company
- Protects documents
- Protects financials
- Focuses each team on their job

Roofers realize: **"SmartSend is literally how we run our entire company."**

Canceling SmartSend would cause:
- ❌ chaos
- ❌ lost documents
- ❌ crew confusion
- ❌ sales mistakes
- ❌ insurance delays
- ❌ scheduling disasters

**They will never leave.**

## Usage Examples

### Check Permission
```sql
SELECT public.has_permission('jobs.edit_pricing', 'workspace-uuid');
```

### Get User Role
```sql
SELECT public.get_user_roofing_role('workspace-uuid', 'user-uuid');
```

### View Audit Logs
```sql
SELECT * FROM public.roofing_audit_logs
WHERE workspace_id = 'workspace-uuid'
ORDER BY created_at DESC
LIMIT 100;
```

### Get Role Dashboard
```sql
-- Owner Dashboard
SELECT * FROM public.owner_dashboard WHERE workspace_id = 'workspace-uuid';

-- Sales Rep Dashboard
SELECT * FROM public.sales_dashboard WHERE user_id = auth.uid();
```

## Next Steps

1. **Application Layer**: Update application code to use `has_permission()` function
2. **UI Updates**: Show/hide UI elements based on user role
3. **API Middleware**: Add permission checks to API endpoints
4. **Audit Log UI**: Build interface to view audit logs
5. **Role Management UI**: Build interface to assign roles to team members

## Testing

To test the permissions system:

1. **Create test users** with different roles
2. **Verify RLS policies** by attempting to access restricted data
3. **Check audit logs** after making changes
4. **Verify dashboards** show correct data for each role
5. **Test permission functions** with different roles

## Security Notes

- All RLS policies use `SECURITY DEFINER` functions for permission checks
- Audit logs are protected by RLS (only workspace members can view)
- Homeowner portal users can only see their own data
- Crew leaders have minimal access (today/tomorrow jobs only)
- Financial data is protected from non-admin roles




































