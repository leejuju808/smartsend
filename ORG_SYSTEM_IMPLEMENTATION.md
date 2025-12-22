# Organizations System Implementation Summary

This document summarizes the implementation of the multi-tenant organizations system with memberships, invites, and RLS policies.

## Database Migrations

### 1. Core Schema (`20250202000000_unified_org_system.sql`)

**Tables Created:**
- `organizations` - Main org table with `id`, `name`, `owner_id`, `created_at`
- `organization_members` - Membership table with composite PK `(org_id, user_id)` and role

**Columns Added:**
- `org_id` added to `campaigns`, `leads`, `email_replies` with foreign keys and cascade on delete

**Functions Created:**
- `create_default_org()` - Trigger function to auto-create org on user signup
- `is_org_member(_org uuid)` - RLS helper to check membership

**RLS Policies:**
- Organizations: members can view
- Organization_members: self + org visibility
- Campaigns, leads, email_replies: read/write limited to org members

**Backfill:**
- Creates default org for existing users
- Backfills `org_id` for campaigns, leads, and email_replies

### 2. Invites Table (`20250202000001_org_invites.sql`)

**Table Created:**
- `invites` - Token-based invites with `token`, `org_id`, `email`, `role`, `created_at`

**RLS Policies:**
- Invites readable by org members

## Edge Functions

### team-invite (`supabase/functions/team-invite/index.ts`)
- Generates UUID tokens for invitations
- Stores invite in `invites` table
- Returns invite URL with token

## API Routes

### `/api/org/active`
- GET: Returns current `org_id` from cookie
- POST: Sets `org_id` cookie

### `/api/org/invite`
- POST: Creates invite via Edge Function

### `/api/team/members`
- GET: Lists org members by `org_id`

## Components

### OrgSwitcher (`src/app/(dashboard)/_components/OrgSwitcher.tsx`)
- Dropdown to switch between orgs
- Reloads page on switch

### Join Page (`src/app/join/page.tsx`)
- Validates invite token
- Creates membership on accept
- Sets `org_id` cookie
- Redirects to dashboard

### Team Page (`src/app/(dashboard)/team-org/page.tsx`)
- Lists org members
- Invite form
- Uses OrgSwitcher

## Helper Functions

### `src/lib/org.ts`
- `getActiveOrgId()` - Reads `org_id` from cookies
- `getActiveOrg()` - Returns full org with membership details
- `setActiveOrgId()` - Sets cookie (placeholder)

## Usage Examples

### Getting Active Org in Server Component
```typescript
import { getActiveOrg } from "@/lib/org";

const org = await getActiveOrg();
const orgId = org?.id;
```

### Creating Campaign with Org
```typescript
const orgId = getActiveOrgId();
await supabase.from("campaigns").insert({
  name: "My Campaign",
  org_id: orgId,
  // ... other fields
});
```

### Querying with Org Filter
```typescript
const orgId = getActiveOrgId();
const { data } = await supabase
  .from("campaigns")
  .select("*")
  .eq("org_id", orgId);
```

## Next Steps

1. **Update Campaign Creation APIs** - Add `org_id` from cookies when creating campaigns
2. **Update Lead Insertion** - Add `org_id` from parent campaign or cookie
3. **Update Reply Detection** - Include `org_id` from lead/campaign when inserting replies
4. **Add Org Switcher to Layout** - Include in dashboard layout
5. **Post-Migration Cleanup** - After backfill, enforce NOT NULL on `org_id` columns

## Post-Migration SQL

```sql
-- After backfill, enforce not nulls:
alter table campaigns alter column org_id set not null;
alter table leads alter column org_id set not null;
alter table email_replies alter column org_id set not null;
```

## Notes

- The system uses both `organization_members` and `org_members` tables. Ensure consistency.
- Workspace system still exists in parallel. Consider consolidation.
- Multiple org systems found in migrations. This implementation uses the latest pattern.

