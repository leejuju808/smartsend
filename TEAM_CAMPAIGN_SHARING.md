# Team Campaign Sharing Implementation

This implementation adds comprehensive team collaboration features to SmartSend AI, including workspace members, role-based access control, invite system, and campaign-level sharing.

## Features Implemented

### 1. Database Schema (`supabase/migrations/20250120_team_campaign_sharing.sql`)

- **Enhanced workspace_members table** with proper role constraints (`owner`, `admin`, `editor`, `viewer`)
- **campaign_members table** for per-campaign ACL
- **workspace_invites table** for invitation system
- **Helper functions** for role checking and membership validation
- **Comprehensive RLS policies** for all tables

### 2. API Endpoints

#### Workspace Invites
- `POST /api/workspaces/invite` - Create workspace invite (admin+ only)
- `POST /api/workspaces/accept` - Accept workspace invite
- `POST /api/invite/accept` - Alternative accept endpoint

#### Campaign Sharing
- `POST /api/campaigns/[id]/share` - Share specific campaign with workspace member

### 3. UI Components

#### InviteMembersDialog (`src/components/workspaces/InviteMembersDialog.tsx`)
- Modal dialog for inviting teammates to workspace
- Role selection (admin, editor, viewer)
- Generates invite links
- Integrated with shadcn/ui components

#### CampaignShareDialog (`src/components/campaigns/CampaignShareDialog.tsx`)
- Modal dialog for sharing specific campaigns
- Role selection (editor, viewer)
- Validates workspace membership

#### Invite Accept Page (`src/app/invite/accept/page.tsx`)
- User-friendly page for accepting invites
- Handles token validation and expiration
- Redirects to dashboard after acceptance

### 4. Updated Pages

#### Workspace Detail Page (`src/app/workspace/[id]/page.tsx`)
- Added InviteMembersDialog to header
- Shows workspace members with roles
- Clean, modern UI layout

## Role Hierarchy

```
owner > admin > editor > viewer
```

### Permissions by Role

**Owner:**
- Full workspace control
- Can manage all members
- Can delete workspace

**Admin:**
- Can invite members
- Can manage member roles
- Can update workspace settings

**Editor:**
- Can create/edit campaigns
- Can manage contacts
- Can share campaigns
- Can view all workspace data

**Viewer:**
- Read-only access to workspace data
- Cannot modify anything

## Campaign-Level ACL

The system supports both workspace-level and campaign-level access control:

1. **Default**: All workspace members can access campaigns based on their workspace role
2. **Override**: Specific campaigns can have custom member lists via `campaign_members` table
3. **Priority**: Campaign-specific permissions override workspace permissions

## Usage Examples

### Invite a Teammate

```tsx
import InviteMembersDialog from "@/components/workspaces/InviteMembersDialog";

// In your workspace page
<InviteMembersDialog workspaceId={workspaceId} />
```

### Share a Campaign

```tsx
import CampaignShareDialog from "@/components/campaigns/CampaignShareDialog";

// In your campaign page
<CampaignShareDialog campaignId={campaignId} workspaceId={workspaceId} />
```

### Check User Permissions

```sql
-- Check if user is workspace member
SELECT public.is_workspace_member('workspace-id');

-- Check if user has minimum role
SELECT public.has_ws_role('workspace-id', 'editor');

-- Check campaign-specific role
SELECT public.has_campaign_role('campaign-id', 'viewer');
```

## Security Features

### Row Level Security (RLS)
- All tables have comprehensive RLS policies
- Users can only access data from workspaces they belong to
- Role-based permissions enforced at database level

### Invite System
- Tokens expire after 7 days
- One-time use tokens
- Email validation required
- Automatic cleanup of expired invites

### API Security
- Authentication required for all endpoints
- Role validation on sensitive operations
- Proper error handling and logging

## Environment Variables

Make sure these are set in your environment:

```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
# or
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## Migration Notes

The migration is idempotent and safe to run multiple times. It will:

1. Update existing workspace members to proper roles
2. Create necessary tables if they don't exist
3. Add RLS policies without breaking existing functionality
4. Backfill data as needed

## Testing

To test the implementation:

1. **Create a workspace** and invite members
2. **Test role permissions** by switching between different user accounts
3. **Test campaign sharing** by sharing campaigns with specific users
4. **Test invite flow** by generating and accepting invites
5. **Verify RLS** by ensuring users only see their workspace data

## Future Enhancements

- Email notifications for invites
- Bulk invite functionality
- Advanced campaign permissions (specific fields)
- Audit logging for team activities
- Workspace templates and presets