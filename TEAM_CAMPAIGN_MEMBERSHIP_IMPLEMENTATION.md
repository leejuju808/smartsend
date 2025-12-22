# Team + Campaign Membership & Roles Implementation

This document describes the implementation of the team and campaign membership system with role-based access control.

## Overview

The system implements:
1. **Team (Account) Membership** - Users belong to teams with roles: `owner`, `admin`, `member`, `viewer`
2. **Campaign-Level Sharing** - Campaigns can be shared with specific users with roles: `editor`, `viewer`
3. **Invite System** - Token-based invites for sharing campaigns
4. **Audit Logging** - Lightweight audit trail for membership changes
5. **RLS Policies** - Row-level security enforcing access control
6. **Billing Integration** - Seat checking before adding members

## Database Schema

### Tables Created

#### `team_members`
- Links users to teams with roles (`owner`, `admin`, `member`, `viewer`)
- Unique constraint on `(team_id, user_id)`

#### `campaign_members`
- Links users to campaigns with roles (`editor`, `viewer`)
- Inherits team membership but can override with campaign-specific roles
- Unique constraint on `(campaign_id, user_id)`

#### `invites`
- Token-based invites for non-users or existing users
- Supports both team-wide and campaign-specific invites
- Expires after 7 days

#### `audit_logs`
- Lightweight audit trail for membership actions
- Tracks: `invite.create`, `invite.accept`, `share.add`, `share.remove`

### Migration Files

1. **`20250131000002_team_campaign_membership.sql`**
   - Creates all membership tables
   - Adds `team_id` column to `campaigns` table
   - Creates helper functions for access checks
   - Sets up RLS policies for membership tables

2. **`20250131000003_campaign_rls_policies.sql`**
   - Updates RLS policies for `campaigns` table
   - Applies tenant-based access control
   - Extends RLS to related tables (contacts, scheduled_messages, replies)

## API Routes

### POST `/api/campaigns/[id]/share/invite`
- Creates an invite for a campaign
- Requires caller to be team owner/admin OR campaign editor
- Checks seat availability before creating invite
- Returns 402 if seats exceeded

**Request:**
```json
{
  "email": "user@example.com",
  "role": "editor" | "viewer"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "uuid-token"
}
```

### POST `/api/invites/accept`
- Accepts an invite token
- Verifies email matches authenticated user
- Adds user to team and campaign (if applicable)
- Checks seat availability before adding

**Request:**
```json
{
  "token": "invite-token"
}
```

**Response:**
```json
{
  "ok": true
}
```

## Authorization Helpers

### `lib/authz/can.ts`

#### `requireCampaignRole(campaignId, userId, roles)`
Checks if user has one of the specified roles for a campaign.

#### `canViewCampaign(campaignId, userId)`
Returns true if user can view the campaign.

#### `canEditCampaign(campaignId, userId)`
Returns true if user can edit the campaign (team owner/admin OR campaign editor).

#### `canDeleteCampaign(campaignId, userId)`
Returns true if user can delete the campaign (only team owners/admins).

#### `getUserCampaignRole(campaignId, userId)`
Returns the user's role for a campaign: `"viewer" | "editor" | "admin" | "owner" | null`

### `lib/authz/seats.ts`

#### `checkSeatAvailability(teamId)`
Checks if team has available seats before adding members.
Returns:
```typescript
{
  ok: boolean;
  seats_used?: number;
  seats_allowed?: number;
  reason?: "seats_exceeded" | "billing_inactive";
}
```

## RLS Policies

### Campaigns Table

**SELECT:** Team members can read campaigns in their team
```sql
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
  )
)
```

**UPDATE:** Team owners/admins OR campaign editors can update
```sql
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
  or exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaigns.id
      and cm.user_id = auth.uid()
      and cm.role = 'editor'
  )
)
```

**DELETE:** Only team owners/admins can delete
```sql
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
)
```

## Role Permissions Matrix

### Team Roles
- **Owner**: Full access to team, can delete campaigns, manage team members
- **Admin**: Full access to team, can delete campaigns, manage team members
- **Member**: Can create campaigns, view team campaigns
- **Viewer**: Read-only access to team campaigns

### Campaign Roles
- **Editor**: Can edit templates, schedule/launch, manage contacts. Cannot delete campaign unless team admin.
- **Viewer**: Read-only access to contacts, templates, analytics. No send/launch.

## Usage Examples

### Check if user can edit campaign
```typescript
import { canEditCampaign } from "@/lib/authz/can";

const canEdit = await canEditCampaign(campaignId, userId);
if (!canEdit) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Use in API route
```typescript
import { requireCampaignRole } from "@/lib/authz/can";

// Require editor role for launch endpoint
const canLaunch = await requireCampaignRole(campaignId, user.id, ['editor']);
if (!canLaunch) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

## Billing Integration

Seat checking is integrated into:
- `/api/campaigns/[id]/share/invite` - Before creating invite
- `/api/invites/accept` - Before adding member

If seats are exceeded, returns 402 status with:
```json
{
  "error": "seats_exceeded",
  "reason": "seats_exceeded",
  "seats_used": 5,
  "seats_allowed": 5
}
```

## Next Steps

1. **UI Components**: Create "Share" drawer component for campaigns
2. **Email Sending**: Implement email sending for invites
3. **Team Management**: Create UI for managing team members
4. **Migration**: Ensure existing campaigns have `team_id` set appropriately
5. **Testing**: Add smoke tests for invite flow, permissions, RLS

## Testing Checklist

- [ ] Owner invites alex@... as Viewer → accept → Alex can open campaign analytics but cannot edit templates or launch
- [ ] Editor rights: Promote Alex to Editor → can edit and schedule, but cannot delete campaign (unless team admin)
- [ ] RLS check: Alex cannot query other team's campaigns via API — select returns 0 rows
- [ ] Removal: Remove Alex from campaign_members → immediate 403 on edit routes
- [ ] Seats: At seat limit → invite returns "seats_exceeded", UI shows Upgrade















