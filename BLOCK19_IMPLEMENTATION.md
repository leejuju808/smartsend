# SmartSend — Block 19: Team Spaces & Roles V2 Implementation

## Overview

Block 19 implements a comprehensive team collaboration and access control system with:
- **Unified Organization System** with 4 roles (owner, admin, member, viewer)
- **Per-Campaign ACL** for fine-grained campaign permissions
- **Per-Inbox ACL** for inbox access control
- **Audit Logging** for tracking all org actions
- **Invitation System** with role-based invites
- **Server-Side Guards** for protecting routes

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250120_block19_team_spaces_roles_v2.sql`)

#### Core Tables Enhanced
- **`org_members`**: Added `viewer` role (now supports: owner, admin, member, viewer)
- **`org_invites`**: Added `viewer` role support
- **`orgs`**: Organization management table

#### New ACL Tables
- **`campaign_acl`**: Per-campaign permissions (read/write)
- **`inbox_acl`**: Per-inbox permissions (read/write)
- **`audit_log`**: Comprehensive audit trail (renamed from audit_logs)

#### Helper Functions
```sql
current_role(p_org_id)           -- Get user's role in org
require_admin(p_org_id)           -- Check if user is admin/owner
can_read_campaign(p_campaign_id)  -- Check campaign read access
can_write_campaign(p_campaign_id) -- Check campaign write access
can_read_inbox(p_inbox_id)        -- Check inbox read access
can_write_inbox(p_inbox_id)       -- Check inbox write access
```

#### RLS Policies
- All tables have row-level security enabled
- Members can read their org's data
- Admins/Owners can manage ACL entries
- Audit log accessible to all org members

### 2. ACL Helper Library (`src/lib/acl.ts`)

TypeScript functions for checking permissions:

```typescript
// Get current user's role
const role = await currentRole();

// Require admin/owner
const { ok } = await requireAdmin();

// Check campaign permissions
const canRead = await canReadCampaign(campaignId);
const canWrite = await canWriteCampaign(campaignId);

// Check inbox permissions
const canRead = await canReadInbox(inboxId);
const canWrite = await canWriteInbox(inboxId);
```

### 3. API Endpoints

#### Role Management
- **`POST /api/members/role`**: Change member role with audit logging
  - Validates admin/owner permissions
  - Prevents demoting last owner
  - Logs role changes to audit_log

#### Invites (Existing)
- **`POST /api/orgs/invites`**: Create invite
- **`GET /api/org/invite/accept`**: Accept invite
- **`GET /api/orgs/invites`**: List invites

### 4. UI Components

#### Settings → Team (`src/app/settings/team/page.tsx`)
- List all org members with roles
- Admin/Owner can:
  - Invite new members
  - Change member roles via dropdown
- Auto-loads org from profile.org_id

#### Settings → Audit (`src/app/settings/audit/page.tsx`)
- Displays last 200 audit entries
- Shows action, target table, target ID
- Simple list format: `timestamp — action — table id`

### 5. Example Server-Side Guards

#### Campaign Page Guard (`src/app/campaigns/[id]/page-guarded.tsx`)
```typescript
export default async function CampaignPage({ params }: { params: { id: string } }) {
  const canRead = await canReadCampaign(params.id);
  
  if (!canRead) {
    return <div>You don't have access to this campaign.</div>;
  }
  
  // Render campaign...
}
```

### 6. Auto-Setup Features

- **Auto-create org**: Trigger creates default org when profile is created
- **Set campaign org_id**: Trigger auto-populates campaign.org_id from user
- **View for members**: `org_members_with_users` joins member + email

## Role Permissions

### Owner
- ✅ Full control (can read/write everything)
- ✅ Manage members (invite, remove, change roles)
- ✅ Manage billing
- ✅ Delete org

### Admin
- ✅ Can read/write everything
- ✅ Manage members (invite, change roles)
- ✅ Cannot manage billing

### Member
- ✅ Can read everything
- ✅ Can write campaigns
- ✅ Cannot manage team
- ✅ Cannot change member roles

### Viewer
- ✅ Read-only access
- ❌ Cannot write campaigns
- ❌ Cannot manage team

## Integration Guide

### 1. Apply Migration

```bash
# In Supabase dashboard SQL editor
# Run: supabase/migrations/20250120_block19_team_spaces_roles_v2.sql
```

### 2. Use ACL Guards in Routes

```typescript
import { canReadCampaign, canWriteCampaign } from '@/lib/acl';

// In server component
export default async function CampaignPage({ params }) {
  const canRead = await canReadCampaign(params.id);
  if (!canRead) return <Forbidden />;
  // ...
}

// In server action
export async function updateCampaign(formData: FormData) {
  const campaignId = formData.get('id');
  const canWrite = await canWriteCampaign(campaignId);
  if (!canWrite) throw new Error('Forbidden');
  // ...
}
```

### 3. Add Sidebar Links

Add to your navigation:
- Settings → Team (manage members)
- Settings → Audit (view audit log)

### 4. Environment Variables

Optional (for invite emails):
```bash
RESEND_API_KEY=re_xxx  # For sending invite emails
NEXT_PUBLIC_APP_URL=https://app.smartsendhq.com
```

## Testing

### 1. Test Role Changes
1. Go to Settings → Team
2. Change a member's role
3. Verify in Settings → Audit that `member.role_changed` is logged

### 2. Test Campaign Guards
1. Create campaign as owner
2. Try accessing campaign as viewer
3. Should see "Access Denied" message

### 3. Test Invites
1. As admin, invite a new email
2. Verify invite appears in org_invites table
3. Accept invite via `/api/org/invite/accept?token=xxx`

## Migration Notes

- Existing `audit_logs` table renamed to `audit_log`
- All campaigns now get `org_id` auto-populated
- Profiles auto-create default org on signup
- No data migration needed (adds new tables)

## Next Steps

1. Run the SQL migration
2. Add sidebar links to Team and Audit pages
3. Add `canReadCampaign` checks to campaign routes
4. Add `canWriteCampaign` checks to campaign edit/delete
5. (Optional) Configure Resend for invite emails

## Files Created/Modified

### Created
- `supabase/migrations/20250120_block19_team_spaces_roles_v2.sql`
- `src/lib/acl.ts`
- `src/app/api/members/role/route.ts`
- `src/app/campaigns/[id]/page-guarded.tsx` (example)
- `BLOCK19_IMPLEMENTATION.md` (this file)

### Modified
- `src/app/settings/team/page.tsx` (rewritten for org_members)
- `src/app/settings/audit/page.tsx` (simplified to match spec)

## Reference

- Block 19 Spec: User query
- Existing org system: `supabase/migrations/20250120_org_system.sql`
- Existing audit logs: `supabase/migrations/20241220_audit_logs.sql`
- RBAC helpers: `src/lib/rbac.ts`
- Org helpers: `src/lib/org.ts`

---

✅ **Block 19 Complete**: Team Spaces & Roles V2 is ready to ship!

