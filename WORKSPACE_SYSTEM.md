# Workspace System Implementation

This document explains the multi-tenant workspace system implemented for SmartSend AI, enabling secure team collaboration with role-based access control.

## Overview

The workspace system provides:
- **Multi-tenant isolation**: Each workspace has its own campaigns, leads, and data
- **Role-based access control**: Owner, Admin, Member, and Viewer roles
- **Row Level Security (RLS)**: Database-level security policies
- **API middleware**: Automatic workspace validation for all endpoints

## Database Schema

### Core Tables

```sql
-- Workspace roles
create type public.workspace_role as enum ('owner','admin','member','viewer');

-- Workspaces table
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz default now()
);

-- Workspace membership
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'member',
  added_at timestamptz default now(),
  primary key (workspace_id, user_id)
);
```

### Workspace-scoped Tables

All domain tables now include `workspace_id`:
- `campaigns`
- `leads`
- `email_logs`
- `send_queue`
- `suppression_list`
- `tasks`
- `email_events`

## API Usage

### Workspace Guard Middleware

Use `requireWorkspace()` to protect API routes:

```typescript
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  
  const { workspace_id, user } = gate;
  // Your API logic here with workspace_id
}
```

### Workspace Context

Get active workspace and user workspaces:

```typescript
import { getActiveWorkspaceId, getUserWorkspaces } from "@/lib/workspace/context";

// Get current workspace from cookie/session
const activeWorkspaceId = await getActiveWorkspaceId();

// Get all workspaces user belongs to
const workspaces = await getUserWorkspaces();
```

## Frontend Integration

### Workspace Switcher Component

```tsx
import { WorkspaceSwitcher } from "@/app/dashboard/components/WorkspaceSwitcher";

<WorkspaceSwitcher workspaces={workspaces} />
```

### API Calls with Workspace Context

Include workspace ID in API calls:

```typescript
// Option 1: Header
fetch('/api/campaigns', {
  headers: { 'x-workspace-id': workspaceId }
});

// Option 2: Query parameter
fetch(`/api/campaigns?wid=${workspaceId}`);
```

## Security Features

### Row Level Security (RLS)

All tables have RLS policies that automatically filter data by workspace:

```sql
-- Example: Campaigns can only be accessed by workspace members
create policy "campaigns_select" on public.campaigns
  for select using ( public.is_workspace_member(workspace_id) );
```

### Helper Functions

- `is_workspace_member(wid)`: Check if user is member of workspace
- `is_workspace_admin(wid)`: Check if user has admin/owner role

## Role Permissions

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, can delete workspace |
| **Admin** | Manage members, edit workspace settings |
| **Member** | Create/edit campaigns, leads, send emails |
| **Viewer** | Read-only access to workspace data |

## Migration Guide

### For Existing Data

1. Run the migration: `supabase/migrations/20251025_workspaces.sql`
2. Create default workspace for existing users
3. Backfill `workspace_id` columns with default workspace ID
4. Update API routes to use workspace middleware

### For New Features

1. Always include `workspace_id` in new tables
2. Use `requireWorkspace()` middleware in API routes
3. Add workspace context to frontend components
4. Test with multiple workspaces

## API Endpoints

### Workspace Management

- `GET /api/workspaces` - List user's workspaces
- `POST /api/workspaces` - Create new workspace
- `POST /api/workspace/select` - Set active workspace

### Member Management

- `GET /api/workspaces/[id]/members` - List workspace members
- `POST /api/workspaces/[id]/members` - Add member
- `DELETE /api/workspaces/[id]/members` - Remove member

## Best Practices

1. **Always validate workspace access** in API routes
2. **Include workspace_id** in all database operations
3. **Use RLS policies** for additional security
4. **Test with multiple workspaces** to ensure isolation
5. **Handle workspace switching** gracefully in UI

## Environment Variables

No additional environment variables required beyond existing Supabase configuration.

## Testing

Test the workspace system by:
1. Creating multiple workspaces
2. Adding different users to workspaces
3. Verifying data isolation between workspaces
4. Testing role-based permissions
5. Confirming RLS policies work correctly