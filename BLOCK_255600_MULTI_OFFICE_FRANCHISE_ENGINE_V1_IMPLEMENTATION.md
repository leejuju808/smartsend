# BLOCK 255600 — SmartSend Multi-Office & Franchise Engine v1 Implementation

## Overview

This implementation transforms SmartSend from a single-company system into a multi-location empire platform — perfect for roofing companies with multiple branches, franchises, and partners running shared operations.

## What Was Built

### 1. Database Schema ✅

**Migration File:** `supabase/migrations/20250130000001_block255600_multi_office_franchise_engine_v1.sql`

#### Core Tables

- **`branches`** - Physical branch offices within companies
  - Supports both `roofing_company_id` and `company_id` references
  - Territory management with ZIP codes, counties, and service area radius
  - Branch settings and metadata

- **`branch_users`** - Users assigned to branches with roles
  - Roles: `hq_owner`, `branch_manager`, `sales_rep`, `pm`, `crew_lead`, `office`, `viewer`
  - Granular permissions via JSONB
  - Active/inactive status

- **`branch_resources`** - Crews, vendors, equipment assigned to branches
  - Resource types: `crew`, `vendor`, `equipment`, `storage`, `trailer`, `technician`
  - Shareable resources across branches
  - Shared with specific branches

- **`branch_performance`** - Daily performance metrics per branch
  - Lead metrics (leads, conversion rate)
  - Job metrics (jobs sold, completed, in progress)
  - Revenue metrics (revenue, avg ticket)
  - Efficiency metrics (cycle time, on-time completion)
  - Quality metrics (customer satisfaction, rework count)

- **`franchise_templates`** - Franchise configuration templates
  - Pricing rules, workflow templates, contract templates
  - Material lists, sales scripts, marketing automation
  - Job workflows, permissions config
  - Public/private templates

- **`franchise_template_applications`** - Applications of templates to branches
  - Tracks template application status
  - Stores applied configuration
  - Error tracking

#### Enhanced Lead Routing

- **`route_lead_to_branch_v2()`** - Enhanced routing function
  - ZIP code matching (primary)
  - County matching (secondary)
  - Service area radius matching (with lat/long)
  - City/state fallback
  - Automatic routing on lead creation

- **Auto-routing trigger** - Automatically routes leads to branches on insert

#### HQ Command Center Views

- **`v_hq_all_branches_summary`** - Summary across all branches
- **`v_hq_branch_performance`** - Branch-by-branch performance comparison
- **`v_hq_cross_office_calendar`** - Cross-office calendar visibility

#### Helper Functions

- **`get_available_shared_resources()`** - Get shareable resources for a branch
- **`apply_franchise_template()`** - Apply franchise template to branch
- **`has_branch_access_v2()`** - Check branch access permissions

### 2. API Endpoints ✅

#### Branch Management

- **`GET /api/branches`** - List branches for current user's company
  - Returns all branches for HQ owners
  - Returns user's assigned branches for others

- **`POST /api/branches`** - Create a new branch (HQ owners only)
  - Validates HQ owner permissions
  - Creates branch and assigns creator as HQ owner

- **`GET /api/branches/[id]`** - Get branch details
  - Returns branch info, users, resources, performance

- **`PATCH /api/branches/[id]`** - Update branch
  - HQ owners and branch managers can update

- **`DELETE /api/branches/[id]`** - Delete branch (soft delete)
  - HQ owners only

#### Branch Users

- **`GET /api/branches/[id]/users`** - List users for a branch
- **`POST /api/branches/[id]/users`** - Add user to branch

#### Branch Resources

- **`GET /api/branches/[id]/resources`** - List resources for a branch
- **`POST /api/branches/[id]/resources`** - Add resource to branch

#### HQ Command Center

- **`GET /api/hq/command-center`** - HQ Command Center Dashboard
  - Summary metrics
  - Branch performance comparison
  - Cross-office calendar
  - Available shared resources

#### Franchise Templates

- **`GET /api/franchise/templates`** - List franchise templates
- **`POST /api/franchise/templates`** - Create franchise template
- **`POST /api/franchise/templates/[id]/apply`** - Apply template to branch

### 3. Frontend Components ✅

#### Pages

- **`app/(owner)/branches/page.tsx`** - Branch management page
- **`app/(owner)/branches/[id]/page.tsx`** - Branch detail page

#### Components

- **`components/branches/BranchesList.tsx`** - List of all branches
- **`components/branches/CreateBranchButton.tsx`** - Button to create new branch
- **`components/branches/CreateBranchDialog.tsx`** - Dialog for creating branches
- **`components/branches/BranchDetail.tsx`** - Branch detail view
- **`components/branches/BranchUsersList.tsx`** - List of branch users
- **`components/branches/BranchResourcesList.tsx`** - List of branch resources
- **`components/branches/BranchPerformanceChart.tsx`** - Performance metrics chart
- **`components/hq/HQCommandCenter.tsx`** - HQ Command Center dashboard component

### 4. Key Features Implemented ✅

#### Branch Management System
- ✅ HQ can create unlimited branches
- ✅ Each branch has separate calendar, crews, vendors, job pipeline, PMs, permissions
- ✅ HQ sees everything, branches see only themselves

#### Location-Based Permission System
- ✅ HQ Owner: sees all branches, edits all settings, moves resources
- ✅ Branch Manager: sees ONLY their branch
- ✅ Sales Rep: only sees their leads + jobs
- ✅ PM: sees jobs for their branch only
- ✅ Crew Lead: sees assigned jobs only

#### Shared Resource Network
- ✅ HQ can mark resources as "shareable"
- ✅ Cross-branch resource visibility
- ✅ Available shared resources API endpoint

#### Multi-Office Lead Routing
- ✅ Automatic routing based on ZIP code (primary)
- ✅ County matching (secondary)
- ✅ Service area radius matching
- ✅ City/state fallback
- ✅ Auto-routing trigger on lead creation

#### Franchise Configuration Templates
- ✅ Template system for pricing rules, workflows, contracts
- ✅ Material lists, sales scripts, marketing automation
- ✅ Job workflows, permissions config
- ✅ One-click template application to branches

#### Cross-Office Calendar & Job Visibility
- ✅ HQ master calendar view
- ✅ Branch-specific views for PMs
- ✅ Cross-office calendar API endpoint

#### HQ Command Center Dashboard
- ✅ Total leads, jobs sold, revenue today
- ✅ Branch performance metrics
- ✅ Branch-by-branch comparison
- ✅ Available shared resources
- ✅ Cross-office calendar visibility

## Database Migration

Run the migration:

```bash
# The migration file is located at:
supabase/migrations/20250130000001_block255600_multi_office_franchise_engine_v1.sql
```

## Usage Examples

### Create a Branch

```typescript
POST /api/branches
{
  "name": "Boise Branch",
  "city": "Boise",
  "state": "ID",
  "address": "123 Main St",
  "phone": "(208) 555-1234",
  "zip_code": "83701",
  "territory_zip_codes": ["83701", "83702", "83703"],
  "territory_counties": ["Ada"],
  "service_area_radius_miles": 50,
  "roofing_company_id": "uuid-here"
}
```

### Route Lead to Branch

Leads are automatically routed when created. The system:
1. Checks lead's ZIP code against branch territory ZIP codes
2. Falls back to county matching
3. Falls back to service area radius (if lat/long provided)
4. Falls back to city/state matching
5. Falls back to first active branch

### Apply Franchise Template

```typescript
POST /api/franchise/templates/{template_id}/apply
{
  "branch_id": "branch-uuid"
}
```

### Get HQ Command Center Data

```typescript
GET /api/hq/command-center
// Returns:
// - summary: overall metrics
// - branchPerformance: branch-by-branch comparison
// - calendar: cross-office calendar
// - sharedResources: available shared resources
```

## Permissions & Security

- **RLS Policies**: All tables have Row Level Security enabled
- **Branch Access**: Users can only access branches they're assigned to
- **HQ Owners**: Can access all branches in their company
- **Role-Based**: Permissions are enforced at the API level

## Next Steps (Future Enhancements)

1. **Distance Calculation**: Implement proper Haversine distance calculation for service area matching
2. **Resource Availability**: Add actual availability checking for shared resources
3. **Performance Tracking**: Automate branch performance data collection
4. **Template Marketplace**: Public marketplace for franchise templates
5. **Advanced Analytics**: More detailed branch comparison and analytics
6. **Mobile App**: Branch management in mobile app
7. **Notifications**: Alerts for branch performance issues
8. **Reporting**: Advanced reporting and export capabilities

## Files Created/Modified

### Database
- `supabase/migrations/20250130000001_block255600_multi_office_franchise_engine_v1.sql`

### API Routes
- `app/api/branches/route.ts`
- `app/api/branches/[id]/route.ts`
- `app/api/branches/[id]/users/route.ts`
- `app/api/branches/[id]/resources/route.ts`
- `app/api/hq/command-center/route.ts`
- `app/api/franchise/templates/route.ts`
- `app/api/franchise/templates/[id]/apply/route.ts`

### Frontend Pages
- `app/(owner)/branches/page.tsx`
- `app/(owner)/branches/[id]/page.tsx`

### Frontend Components
- `components/branches/BranchesList.tsx`
- `components/branches/CreateBranchButton.tsx`
- `components/branches/CreateBranchDialog.tsx`
- `components/branches/BranchDetail.tsx`
- `components/branches/BranchUsersList.tsx`
- `components/branches/BranchResourcesList.tsx`
- `components/branches/BranchPerformanceChart.tsx`
- `components/hq/HQCommandCenter.tsx`

## Testing

To test the implementation:

1. **Create a branch**: Navigate to `/branches` and create a new branch
2. **Add users**: Add users to the branch with different roles
3. **Add resources**: Mark crews/vendors as shareable
4. **Test lead routing**: Create a lead and verify it routes to the correct branch
5. **View HQ dashboard**: Navigate to HQ command center to see all branches
6. **Apply template**: Create and apply a franchise template

## Notes

- The implementation builds on existing Block 249000 (Enterprise Mode) infrastructure
- Supports both `roofing_companies` and `companies` table structures
- All API endpoints include proper authentication and authorization
- RLS policies ensure data security at the database level
- The system is designed to scale to hundreds of branches





















