# Teams System Implementation

A complete multi-tenant teams system for SmartSend AI, built on PostgreSQL and Supabase with Row-Level Security (RLS).

## Overview

This implementation provides:
- **Teams, Members, and Invites**: Full CRUD operations
- **Row-Level Security**: Database-level access control
- **API Routes**: RESTful endpoints for team management
- **UI Components**: Team switcher and member invite dialog
- **Integration**: Automatic team_id enforcement on all data objects

## Database Schema

### Core Tables

#### `teams`
```sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

#### `team_members`
```sql
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
```

#### `team_invites`
```sql
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
```

### Helper Views & Functions

#### `v_my_teams`
Returns all team IDs the current user is a member of.

#### `is_member_of(p_team uuid)`
Boolean check if current user is a member of a team.

#### `v_my_team_roles`
Returns team_id and role for current user.

### Data Isolation

The following tables have `team_id` columns for multi-tenancy:
- `campaigns`
- `leads`
- `inboxes`
- `emails`
- `send_queue`

RLS policies ensure users can only access data in teams they belong to.

## Row-Level Security Policies

### Teams
- **Read**: Members can read their teams
- **Insert**: Anyone can create a team
- **Update**: Only owners/admins can update

### Team Members
- **Read**: Members can view all members of their teams
- **Manage**: Only owners/admins can add/remove members

### Team Invites
- **Read**: Only owners/admins can view invites
- **Create/Update**: Only owners/admins can manage invites

### Data Tables
- **All operations**: Users can only access data from teams they belong to

## API Routes

### POST `/api/teams/create`
Create a new team and add the creator as owner.

**Request:**
```json
{
  "name": "My Team",
  "userId": "uuid" // optional, uses auth user if not provided
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "My Team",
  "created_by": "uuid",
  "created_at": "2024-02-01T00:00:00Z"
}
```

### POST `/api/teams/invite`
Invite a user to a team via email with a magic link.

**Request:**
```json
{
  "teamId": "uuid",
  "email": "user@example.com",
  "role": "member", // admin, member, or viewer
  "invitedBy": "uuid" // optional, uses auth user if not provided
}
```

**Response:**
```json
{
  "ok": true
}
```

### POST `/api/teams/accept-invite`
Accept a team invitation via token.

**Request:**
```json
{
  "token": "invite-token-here",
  "userId": "uuid" // optional, uses auth user if not provided
}
```

**Response:**
```json
{
  "ok": true,
  "message": "joined"
}
```

## UI Components

### TeamSwitcher
Located at `src/components/TeamSwitcher.tsx`.

A dropdown component for switching between teams. Props:
- `currentTeamId?: string` - Currently selected team
- `onSwitch: (id: string) => void` - Callback when team changes

### InviteMember
Located at `src/components/InviteMember.tsx`.

A dialog component for inviting team members. Props:
- `teamId: string` - Team to invite to
- `invitedBy: string` - User initiating the invite

## Usage Examples

### Creating a Team
```typescript
const res = await fetch('/api/teams/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Team' })
});
const team = await res.json();
```

### Inviting a Member
```typescript
const res = await fetch('/api/teams/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    teamId: 'team-uuid',
    email: 'member@example.com',
    role: 'admin'
  })
});
```

### Accepting an Invite
```typescript
const res = await fetch('/api/teams/accept-invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'invite-token' })
});
```

### Using TeamSwitcher
```tsx
import TeamSwitcher from '@/components/TeamSwitcher'

function MyComponent() {
  const [activeTeamId, setActiveTeamId] = useState<string>('')
  
  return (
    <TeamSwitcher 
      currentTeamId={activeTeamId}
      onSwitch={setActiveTeamId}
    />
  )
}
```

### Using InviteMember
```tsx
import InviteMember from '@/components/InviteMember'

function TeamSettings({ teamId, userId }) {
  return (
    <div>
      <InviteMember teamId={teamId} invitedBy={userId} />
    </div>
  )
}
```

## Migration

The migration file `supabase/migrations/20250201_teams_complete_system.sql` consolidates existing teams infrastructure and adds:
- Proper schema with all required columns
- Helper views and RPC functions
- Complete RLS policies
- Migration from old `team_invitations` table to `team_invites`
- Team ID columns on all data tables

To apply:
```bash
supabase db push
```

## Guardrails & Best Practices

1. **Always validate team membership** before allowing data access
2. **Use RLS policies** for database-level security
3. **Enforce role-based permissions** in API routes (owner/admin/member/viewer)
4. **Store active team in context** for automatic filtering
5. **Validate team_id** on all create operations

## Integration Points

### Campaigns
```typescript
await supabase.from('campaigns').insert({ 
  team_id: activeTeamId, 
  name: 'My Campaign',
  // ... other fields
});
```

### Leads
```typescript
await supabase.from('leads').insert(
  rows.map(r => ({ ...r, team_id: activeTeamId }))
);
```

### Send Queue
```typescript
await supabase.from('send_queue').insert({ 
  team_id: activeTeamId,
  // ... other fields
});
```

## Notes

- Teams are independent from workspaces (legacy system)
- Users can belong to multiple teams
- Invite tokens expire after 7 days
- Only admins and owners can invite members
- Viewer role is read-only

