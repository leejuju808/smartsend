# Teams, Memberships, and Campaign Access - Implementation Summary

## ✅ Completed Implementation

### 1. Database Schema (`supabase/migrations/20250220000001_teams_and_campaign_access.sql`)

- ✅ **Teams table**: Stores team information with owner
- ✅ **Team members table**: Manages team membership with roles (owner, admin, sender, viewer)
- ✅ **Campaign team_id**: Added nullable `team_id` column to campaigns table
- ✅ **Campaign members table**: Per-campaign role overrides
- ✅ **Access view**: `v_campaign_access` view computes effective role for each user-campaign pair
- ✅ **Indexes**: Added for performance
- ✅ **RLS policies**: 
  - Teams: readable by members, mutable by owners/admins
  - Team members: readable by team members, manageable by owners/admins
  - Campaign members: readable by users with campaign access, manageable by admins
  - Campaigns: readable by users with access, updatable by admins/owners
  - Campaign leads: readable by users with access, writable by senders/admins
  - Send queue: readable by users with access, writable by senders/admins
  - Send logs: readable by users with access

### 2. Invite Flow (`app/(dashboard)/campaigns/[id]/settings/invite/actions.ts`)

- ✅ Server action to invite users to campaigns
- ✅ Validates admin role via `v_campaign_access`
- ✅ Looks up user by email (checks profiles table, then uses service role if available)
- ✅ Adds user to team (if campaign has a team)
- ✅ Grants per-campaign role

**Note**: For automatic user invitation emails, you'll need to set up a Supabase Edge Function with service role access. The current implementation works for existing users.

### 3. Share UI (`app/(dashboard)/campaigns/[id]/settings/share/page.tsx`)

- ✅ Client component for inviting team members
- ✅ Email input and role selector (viewer, sender, admin)
- ✅ Calls invite action and displays feedback

## Permission Matrix

- **viewer**: Read-only access to campaign, leads, queue, logs
- **sender**: Everything viewer + can launch, pause, resend, mark-replied
- **admin**: Everything sender + manage invites/members, edit campaign settings, delete

## Quick Test Steps (≤5 min)

1. **Apply the migration**:
   ```bash
   # Via Supabase Dashboard SQL Editor or CLI
   supabase db push
   ```

2. **Create a team** (via SQL or API):
   ```sql
   INSERT INTO public.teams (owner_id, name)
   VALUES (auth.uid(), 'My Team')
   RETURNING id;
   
   -- Add yourself as owner
   INSERT INTO public.team_members (team_id, user_id, role)
   VALUES ('<team_id>', auth.uid(), 'owner');
   ```

3. **Attach team to campaign**:
   ```sql
   UPDATE public.campaigns
   SET team_id = '<team_id>'
   WHERE id = '<campaign_id>';
   ```

4. **Invite a second email**:
   - Navigate to `/dashboard/campaigns/[id]/settings/share`
   - Enter email and select "sender" role
   - Click "Invite"

5. **Test permissions**:
   - Log in as invited account → confirm you see the campaign, can launch but not manage members
   - Change role to viewer → action buttons should disappear
   - Change role to admin → can invite/remove members

## Next Steps / Enhancements

1. **Automatic User Invitations**: Set up Supabase Edge Function to handle `auth.admin.inviteUserByEmail()` with service role
2. **Team Creation UI**: Add UI for creating teams (currently requires SQL/API)
3. **Member Management**: Add UI to view/manage team members and campaign members
4. **Role-based UI Controls**: Update campaign pages to show/hide controls based on `v_campaign_access.role`

## Files Created

- `supabase/migrations/20250220000001_teams_and_campaign_access.sql`
- `app/(dashboard)/campaigns/[id]/settings/invite/actions.ts`
- `app/(dashboard)/campaigns/[id]/settings/share/page.tsx`

## Accessing the Share Page

The share page is available at:
```
/dashboard/campaigns/[id]/settings/share
```

Make sure to add a link to this page from your campaign settings navigation if it doesn't already exist.

