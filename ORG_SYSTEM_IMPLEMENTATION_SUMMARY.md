# Organization System Implementation Summary

This document summarizes the implementation of the multi-tenant organization system with invites, members, and RLS as requested.

## Database Migrations

### 1. Unified Org System (`20250216000003_unified_org_system.sql`)

This migration establishes the core organization structure:

**Tables Created:**
- `organizations` - Main organization/workspace table with owner_id
- `org_memberships` - Unified table for both active memberships and pending invites

**Key Features:**
- **Combined Invite/Membership Pattern**: The `org_memberships` table handles both pending invites and active members through the `status` and `invited_email` fields
- **Roles**: `owner`, `admin`, `member`
- **Status Tracking**: `active`, `pending`, `accepted`, `expired`, `revoked`

**Indexes:**
- Org and user lookups
- Token-based invite lookups
- Email-based invite tracking

**RLS Policies:**
- Organizations readable by members
- Memberships readable by members and admins
- Admin-only membership management

**Helper Functions:**
- `my_orgs()` - Returns current user's organizations with roles
- `ensure_default_org()` - Creates default org for users without one
- `is_org_member()` - Checks membership status
- `is_org_admin()` - Checks admin/owner status

**Auto-Triggers:**
- `trg_add_owner_membership` - Automatically adds creator as owner when org is created

### 2. Org Project Linkage and RLS (`20250216000004_org_project_linkage_rls.sql`)

This migration links campaigns and leads to organizations and extends RLS:

**Schema Changes:**
- Adds `org_id` to `campaigns` and `leads` tables
- Creates indexes on `org_id` columns

**RLS Policies:**
- Campaigns: Read by org members, write by active members
- Leads: Read by org members, write by active members
- All policies respect org membership status

**Backfill Logic:**
- Attempts to backfill `org_id` from `workspace_id` or `user_id` if those columns exist
- Propagates org_id from campaigns to leads
- Falls back to user's org for orphaned leads

## API Routes

### Existing Routes (Already Implemented)

1. **Invite Endpoint**: `POST /api/orgs/[orgId]/invite`
   - Creates pending invite with token
   - Returns invite URL
   - Route: `src/app/api/orgs/[orgId]/invite/route.ts`

2. **Accept Invite Endpoint**: `POST /api/orgs/invites/accept`
   - Accepts token and converts pending invite to active membership
   - Route: `src/app/api/orgs/invites/accept/route.ts`

3. **List Orgs**: `GET /api/orgs/list`
   - Returns user's organizations with roles
   - Route: `src/app/api/orgs/list/route.ts`

### Additional Routes Available

- `POST /api/orgs` - Create organization
- `GET /api/orgs` - List organizations
- `POST /api/orgs/invites` - Create invite (alternative path)
- `GET /api/orgs/[id]/members` - List organization members

## UI Components

### Org Switcher

**Location**: `src/components/org/OrgSwitcher.tsx`

**Features:**
- Fetches user's organizations
- Displays dropdown with org names
- Saves selection to localStorage as `orgId`
- Auto-selects first org if none selected

**Usage:**
```tsx
import OrgSwitcher from "@/components/org/OrgSwitcher";

<OrgSwitcher />
```

### Campaign Sharing

**Location**: `src/components/campaigns/ShareCampaign.tsx`

**Features:**
- Share/unshare campaigns with current team
- Permission controls (can_edit, can_send)
- Uses current `orgId` from localStorage
- Toast notifications for actions

**Usage:**
```tsx
import ShareCampaign from "@/components/campaigns/ShareCampaign";

<ShareCampaign campaignId={campaignId} />
```

## How the System Works

### Invite Flow

1. **Admin/Owner creates invite:**
   ```typescript
   POST /api/orgs/[orgId]/invite
   { email: "user@example.com", role: "member" }
   ```
   - Creates a `org_memberships` row with `status='pending'`, `user_id=null`, `invited_email`, and `invited_token`

2. **User accepts invite:**
   ```typescript
   POST /api/orgs/invites/accept
   { token: "abc123..." }
   ```
   - Deletes the pending membership
   - Creates new membership with `status='active'` and `user_id` set
   - Returns `org_id`

3. **RLS automatically applies:**
   - User can now see campaigns/leads in that org
   - All queries filtered by active membership

### Org Access Pattern

1. **User selects org** via OrgSwitcher → `localStorage.setItem('orgId', orgId)`

2. **App reads current org:**
   ```typescript
   const orgId = localStorage.getItem('orgId');
   ```

3. **Campaigns automatically scoped:**
   - All queries filtered by RLS based on membership
   - No need to manually filter in queries

### Sharing Campaigns

When a campaign is shared with an org:

1. User selects campaign and clicks "Share with current team"
2. Creates `campaign_shares` entry linking campaign to org
3. All members of that org can now access the campaign
4. Permissions controlled by `can_edit` and `can_send` flags

## Data Model Summary

```
organizations
├── id (uuid)
├── name (text)
├── owner_id (uuid) → auth.users(id)
└── created_at (timestamptz)

org_memberships
├── org_id (uuid) → organizations(id)
├── user_id (uuid) → auth.users(id) | null
├── invited_email (text) | null
├── role (text): 'owner' | 'admin' | 'member'
├── status (text): 'active' | 'pending' | 'accepted' | 'expired' | 'revoked'
├── invited_token (text) | null
└── created_at (timestamptz)

campaigns
├── id (uuid)
├── org_id (uuid) → organizations(id)  [NEW]
└── ... (other fields)

leads
├── id (uuid)
├── org_id (uuid) → organizations(id)  [NEW]
└── ... (other fields)
```

## Security Model

### RLS at Database Level

All data access enforced by Row Level Security:

1. **Organization Access**: Users only see orgs they're members of
2. **Campaign Access**: Users only see campaigns in their orgs
3. **Lead Access**: Users only see leads in their orgs
4. **Membership Management**: Only owners/admins can manage members

### API-Level Validation

Routes check permissions before operations:
- Invite creation: Requires admin/owner role
- Campaign creation: Must be member of target org
- Sharing: Must be admin of campaign's org

## Migration Notes

**Important**: The system uses **two different naming conventions** in the codebase:

1. **New Pattern**: `organizations` + `org_memberships` (recommended, used in newer routes)
2. **Legacy Pattern**: `orgs` + `org_members` (exists in older migrations)

The migrations created target the `organizations` + `org_memberships` pattern to align with the existing invite API routes. If you have mixed usage, consider adding a view or alias:

```sql
CREATE OR REPLACE VIEW orgs AS SELECT * FROM organizations;
CREATE OR REPLACE VIEW org_members AS SELECT * FROM org_memberships;
```

## Next Steps

1. **Run Migrations**: Apply the two new migrations to your database
2. **Backfill Existing Data**: Migrations include backfill logic for existing campaigns/leads
3. **Update Frontend**: Ensure all components use localStorage.getItem('orgId')
4. **Test Invite Flow**: Create an invite, accept it, verify RLS isolation
5. **Monitor Performance**: Check that indexes are being used on org_id columns

## Testing Checklist

- [ ] Create organization → owner automatically added
- [ ] Invite user → pending membership created
- [ ] Accept invite → active membership created
- [ ] Switch org → localStorage updates, campaign list refreshes
- [ ] Share campaign → appears in shared org
- [ ] Verify RLS isolation between orgs
- [ ] Test permission boundaries (member vs admin)
- [ ] Check backfill logic populated org_ids correctly

## Notes

The implementation follows the requested structure closely:
- ✅ Organizations, members, invites
- ✅ RLS policies for org-scoped access
- ✅ RPC helper functions
- ✅ Invite + accept API routes
- ✅ Org switcher UI
- ✅ Campaign sharing

The main difference from the spec is using `organizations` + `org_memberships` instead of `orgs` + `org_members` to align with existing API routes.

