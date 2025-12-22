# Workspace System Migration Guide

## Quick Start

### 1. Apply Database Migrations

```bash
# If using Supabase CLI
supabase migration new workspaces_system
supabase db push

# Or apply manually via Supabase dashboard
```

The migrations include:
- `20250101000000_workspaces.sql` - Core schema and RLS
- `20250101000001_backfill_workspaces.sql` - Data backfill

### 2. Verify Migration Success

Check that tables exist:
```sql
SELECT * FROM workspaces LIMIT 1;
SELECT * FROM workspace_members LIMIT 1;
SELECT * FROM workspace_invites LIMIT 1;
```

### 3. Update Your Code

#### Add Workspace Context to API Routes

Example:
```typescript
import { getCurrentWorkspaceId } from '@/lib/workspace';

export async function POST(req: NextRequest) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const workspaceId = await getCurrentWorkspaceId();
  
  const { data } = await supabase
    .from('leads')
    .insert({
      workspace_id: workspaceId,
      // ... other fields
    });
}
```

#### Add Workspace Filtering to Queries

```typescript
const { data } = await supabase
  .from('campaigns')
  .select('*')
  .eq('workspace_id', workspaceId);
```

#### Use Workspace Guards

```typescript
import { requireWorkspace } from '@/lib/workspace/withWorkspace';

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  const { workspace_id, user } = gate;
  
  // Proceed with workspace_id guaranteed
}
```

### 4. Add UI Components

Add `WorkspaceSwitcher` to your nav/dashboard:

```tsx
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';

export default function Dashboard() {
  return (
    <div>
      <WorkspaceSwitcher />
      {/* ... rest of dashboard */}
    </div>
  );
}
```

### 5. Test the System

#### Create Your First Workspace
```bash
curl -X POST http://localhost:3000/api/workspaces/create \
  -H "Content-Type: application/json" \
  -d '{"name":"My Workspace"}'
```

#### List Your Workspaces
```bash
curl http://localhost:3000/api/workspaces/list
```

#### Invite a Team Member
```bash
curl -X POST http://localhost:3000/api/workspaces/invite \
  -H "Content-Type: application/json" \
  -d '{"email":"teammate@example.com","role":"member"}'
```

## Common Issues

### Issue: "Missing workspace" errors

**Solution**: Ensure workspace ID is set in cookie or header:
```typescript
const workspaceId = req.cookies.get('ws')?.value || 
                    req.headers.get('x-workspace-id');
```

### Issue: RLS blocking all queries

**Solution**: Verify RLS policies are enabled and user is a workspace member:
```sql
SELECT * FROM workspace_members WHERE user_id = auth.uid();
```

### Issue: Backfill didn't run

**Solution**: Run backfill manually or create default workspaces:
```sql
-- Create workspace for yourself
INSERT INTO workspaces (name, created_by)
VALUES ('My Workspace', auth.uid());

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES (
  (SELECT id FROM workspaces WHERE created_by = auth.uid() LIMIT 1),
  auth.uid(),
  'owner'
);
```

## Files Modified

### New Files
- `supabase/migrations/20250101000000_workspaces.sql`
- `supabase/migrations/20250101000001_backfill_workspaces.sql`
- `src/app/api/me/workspaces/route.ts`
- `src/app/api/workspaces/invite/accept/route.ts`
- `src/components/WorkspaceSwitcher.tsx`
- `docs/WORKSPACE_IMPLEMENTATION.md`
- `docs/MIGRATION_GUIDE.md`

### Modified Files
- `src/app/api/workspaces/create/route.ts` - Added created_by
- `src/app/api/workspaces/invite/route.ts` - Token generation
- `src/app/api/workspaces/accept/route.ts` - Updated accept logic
- `src/lib/permissions.ts` - Added assertAdmin()

## Rollback Plan

If needed, rollback with:
```sql
-- Disable RLS
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members DISABLE ROW LEVEL SECURITY;
-- ... repeat for other tables

-- Drop tables
DROP TABLE IF EXISTS workspace_invites;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
DROP TYPE IF EXISTS role;

-- Remove workspace_id columns
ALTER TABLE leads DROP COLUMN workspace_id;
ALTER TABLE campaigns DROP COLUMN workspace_id;
ALTER TABLE sending_accounts DROP COLUMN workspace_id;
ALTER TABLE send_queue DROP COLUMN workspace_id;
ALTER TABLE campaign_logs DROP COLUMN workspace_id;
```
