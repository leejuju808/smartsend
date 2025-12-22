# Workspace System Implementation Summary

This document summarizes the workspace/organization system implementation. **Note: Core workspace infrastructure already exists** (migration `20251025_workspaces.sql`). This adds the invite system.

## What Was Implemented

### 1. Invitation System (Migration: `20250101000000_workspace_invites.sql`)

- Created `workspace_invites` table for magic-link invitations
- Added `invited_by` column to `workspace_members` for tracking
- Added `workspace_id` columns to:
  - `sending_accounts`
  - `campaign_logs`
- Added `role_at_least()` helper function for granular permissions
- Created RLS policies for the invite system

### 2. Row Level Security (RLS) - Updated

Note: Base RLS was already implemented in `20251025_workspaces.sql`. This adds:

Enabled RLS on all tables with policies:
- **Workspaces**: Members can read, admins can update, owners can delete
- **Workspace Members**: Members can read roster, admins manage memberships
- **Workspace Invites**: Admins can read/write invites
- **Resource Tables** (leads, campaigns, etc.): Members can access resources, admins can delete

Helper functions (already existed):
- `is_workspace_member(wid)` - Check if current user is a member
- `is_workspace_admin(wid)` - Check if user is admin/owner

New helper function:
- `role_at_least(p_workspace uuid, p_min role)` - Check if user has required role level

### 3. API Routes

#### Workspace Management
- `POST /api/workspaces/create` - Create workspace and add creator as owner
- `GET /api/workspaces/list` - List user's workspaces
- `POST /api/workspaces/invite` - Invite member (admins only)
- `GET /api/workspaces/invite/accept?token=xxx` - Accept invite via magic link
- `POST /api/workspaces/accept` - Accept invite programmatically

#### User Workspaces
- `GET /api/me/workspaces` - Get current user's workspaces with active selection

### 4. Helper Functions

#### `src/lib/permissions.ts`
- `checkPermission()` - Original permission checker
- `assertAdmin()` - NEW: Verify user is admin/owner in workspace

#### `src/lib/workspace.ts`
- `getCurrentWorkspaceId()` - Get active workspace from cookie
- `getCurrentWorkspace()` - Get full workspace details with role
- `getUserWorkspaces()` - List all user's workspaces
- `requireWorkspaceAccess()` - Require workspace with specific roles

#### `src/lib/workspace/withWorkspace.ts`
- `requireWorkspace()` - API guard to require workspace access
- `requireWorkspaceAdmin()` - API guard to require admin access

### 5. UI Components

- `src/components/WorkspaceSwitcher.tsx` - Workspace selection dropdown

### 6. No Backfill Migration Needed

The existing workspace system already handles workspace membership. The invite system is additive and doesn't require data migration.

## Usage Examples

### Creating a Workspace
```typescript
const res = await fetch('/api/workspaces/create', {
  method: 'POST',
  body: JSON.stringify({ name: 'My Company' })
});
```

### Inviting a Member
```typescript
const res = await fetch('/api/workspaces/invite', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', role: 'member' })
});
// Returns: { ok: true, link: '...', token: '...' }
```

### Checking Admin Access
```typescript
import { assertAdmin } from '@/lib/permissions';

try {
  await assertAdmin(workspaceId);
  // User is admin or owner
} catch (error) {
  // User not authorized
}
```

### Filtering by Workspace
```typescript
import { getCurrentWorkspaceId } from '@/lib/workspace';

const workspaceId = await getCurrentWorkspaceId();
const { data } = await supabase
  .from('leads')
  .select('*')
  .eq('workspace_id', workspaceId);
```

## Integration Points

### Existing Code Updates Needed

1. **Update all INSERT operations** to include `workspace_id`:
   ```typescript
   await supabase.from('leads').insert({
     workspace_id: workspaceId,
     // ... other fields
   });
   ```

2. **Update all SELECT queries** to filter by `workspace_id`:
   ```typescript
   await supabase.from('leads')
     .select('*')
     .eq('workspace_id', workspaceId);
   ```

3. **Add workspace context** to user sessions via cookie or header

### Cookie-Based Workspace Selection

The system uses a `ws` cookie to track the active workspace:
```typescript
cookies().set('ws', workspaceId, { path: '/', httpOnly: false });
```

## RLS Automatic Enforcement

With RLS enabled, all queries are automatically scoped by workspace membership. Users can only:
- Access resources in workspaces they're members of
- Create resources in workspaces they're members of
- Delete resources only if they're admins/owners

No manual filtering required - Supabase handles it automatically.

## Next Steps

1. Run migrations: `supabase db push` or apply migrations manually
2. Run backfill script to assign existing data to workspaces
3. Update existing API routes to pass `workspace_id` from cookie/header
4. Add WorkspaceSwitcher component to dashboard/nav
5. Test invite flow: create workspace → invite user → accept invite
6. Verify RLS is working by testing cross-workspace access restrictions

## Testing Checklist

- [ ] Create a new workspace
- [ ] List user's workspaces
- [ ] Invite a member
- [ ] Accept invite via magic link
- [ ] Verify RLS prevents cross-workspace access
- [ ] Verify admins can delete resources
- [ ] Verify members can read/write resources
- [ ] Test workspace switcher UI
- [ ] Verify backfill assigns existing data correctly

## Notes

- The `role` enum is used throughout for permissions
- RLS policies use the helper functions for cleaner logic
- Invite tokens are secure random bytes (24 bytes hex)
- Invite links expire after 7 days
- Workspace ID is propagated via cookie (`ws`) for easy access
