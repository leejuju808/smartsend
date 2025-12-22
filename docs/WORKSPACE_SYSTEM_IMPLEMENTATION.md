# Workspace System Implementation

This document describes the multi-tenant workspace system implementation.

## Overview

The workspace system provides:
- Tenant isolation via `workspace_id` foreign keys
- Row-Level Security (RLS) policies
- Workspace switching via cookie-based context
- Team member management (owner, admin, member roles)
- Invitation system for adding team members

## Database Schema

### Core Tables

1. **workspaces** - Top-level tenant container
   - `id` (uuid, primary key)
   - `name` (text)
   - `owner_id` (uuid, foreign key to auth.users)
   - `created_at` (timestamptz)

2. **workspace_members** - Membership records
   - `workspace_id` (uuid, foreign key)
   - `user_id` (uuid, foreign key)
   - `role` (text: 'owner', 'admin', 'member')
   - `created_at` (timestamptz)
   - Composite primary key (workspace_id, user_id)

3. **workspace_invites** - Invitation records
   - `id` (uuid, primary key)
   - `workspace_id` (uuid, foreign key)
   - `email` (text)
   - `role` (text: 'admin', 'member', 'editor', 'viewer')
   - `token` (text, unique)
   - `created_at` (timestamptz)
   - `expires_at` (timestamptz)
   - `accepted_at` (timestamptz, nullable)

### Tenant Data Tables

These tables have `workspace_id` foreign keys for tenant isolation:
- `campaigns`
- `leads`
- `campaign_logs`
- `provider_accounts`

### RLS Policies

1. **workspaces** - Members can read, owners/admins can update
2. **workspace_members** - Members can view, owners/admins can manage
3. **workspace_invites** - Owners/admins can manage invites
4. **Tenant data tables** - Members can only access their workspace data

## Implementation Files

### SQL Migration
- `supabase/migrations/20251026_workspaces.sql`
  - Creates workspace, member, and invite tables
  - Adds workspace_id to tenant data tables
  - Implements RLS policies
  - Creates helper functions: `is_workspace_member()`, `create_workspace()`, `accept_invite()`
  - Backfills personal workspaces for existing users

### Workspace Context Helper
- `src/lib/workspaces/server.ts`
  - `getActiveWorkspaceId()` - Gets current workspace from cookie or user default

### API Routes

#### Workspace Management
- `src/app/api/workspaces/switch/route.ts` - Switches active workspace
- `src/app/api/me/workspace/route.ts` - Gets current active workspace ID

#### Invitation Management
- `src/app/api/invites/create/route.ts` - Creates workspace invitation
- `src/app/api/invites/accept/route.ts` - Accepts invitation via RPC

#### Team Management
- `src/app/api/team/members/route.ts` - Lists workspace members
- `src/app/api/team/invites/route.ts` - Lists pending invites

### UI Components
- `src/app/(dashboard)/team/page.tsx` - Team management page (server)
- `src/app/(dashboard)/team/ui/TeamClient.tsx` - Team management UI (client)
- `src/app/invite/accept/page.tsx` - Accept invitation page

## Usage

### Server Actions

To get the active workspace in server code:

```typescript
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

const workspaceId = await getActiveWorkspaceId();
```

### Creating Data

Always include `workspace_id` when creating tenant-scoped data:

```typescript
const { data, error } = await supabase
  .from("campaigns")
  .insert({ 
    workspace_id: workspaceId,
    name: "My Campaign",
    // ... other fields
  });
```

### Accepting Invitations

Invitations are accepted via the RPC function or API route:

```typescript
// Via RPC
const { data } = await supabase.rpc("accept_invite", { p_token: token });

// Via API (also sets cookie)
const res = await fetch("/api/invites/accept", {
  method: "POST",
  body: JSON.stringify({ token })
});
```

## Key Features

1. **Cookie-based Workspace Context** - Uses `active_ws` cookie for current workspace
2. **Automatic Backfill** - Creates personal workspaces for existing users
3. **Secure Invitations** - Token-based invitations with expiration
4. **Flexible Roles** - owner, admin, member, editor, viewer
5. **RLS Enforcement** - All tenant data is automatically filtered by membership

## Next Steps

To complete the implementation:

1. Add workspace_id to additional tables as needed
2. Implement email sending for invitations
3. Add workspace switcher UI component
4. Implement workspace-level settings
5. Add analytics and billing per workspace
