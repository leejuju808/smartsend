# SmartSend Workspace Security Implementation

This document outlines the implementation of proper multi-tenant security with workspaces, roles, and RLS policies to replace the `app.set_workspace` shortcut.

## 🚀 What's Been Implemented

### 1. Database Schema & RLS Policies
- **Workspaces table**: Core workspace management
- **Workspace members**: User membership with role-based access
- **Workspace invites**: Email-based invitation system
- **RLS policies**: Row-level security on all workspace-scoped tables
- **Role system**: Owner, Admin, Member, Viewer hierarchy

### 2. Supabase Client Helpers
- **`userClient()`**: For authenticated user actions (enforces RLS)
- **`adminClient()`**: For webhooks only (bypasses RLS)

### 3. API Endpoints
- **`/api/workspaces/create`**: Create new workspaces
- **`/api/workspaces/invite`**: Invite team members
- **`/api/workspaces/join`**: Accept invitations
- **`/api/workspaces/invite/validate`**: Validate invitation tokens

### 4. UI Components
- **Workspaces page**: Manage workspace membership
- **Workspace switcher**: Switch between workspaces
- **Invite form**: Invite new team members
- **Join page**: Accept workspace invitations

## 📋 Database Migration

Run the SQL migration in your Supabase SQL editor:

```sql
-- Run the contents of: supabase/migrations/20250140_workspace_security_rls.sql
```

This migration:
- Creates proper workspace tables and relationships
- Implements RLS policies using `app.is_member()` function
- Replaces old `app.set_workspace` approach
- Grants necessary permissions to authenticated users

## 🔐 Security Model

### Role Hierarchy
1. **Owner** (4): Full control, can delete workspace
2. **Admin** (3): Manage team, settings, policies
3. **Member** (2): Create/edit content, enroll contacts
4. **Viewer** (1): Read-only access

### RLS Policy Examples
```sql
-- Contacts: member+ for IUD, viewer for select
create policy "contacts_select_member" on public.contacts
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "contacts_mutate_member" on public.contacts
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Send policies: admin+ only
create policy "send_policies_admin_iud" on public.send_policies
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );
```

## 🛠️ Usage Examples

### Creating a Workspace
```typescript
// POST /api/workspaces/create
const formData = new FormData();
formData.append('name', 'My Team Workspace');
const response = await fetch('/api/workspaces/create', {
  method: 'POST',
  body: formData
});
```

### Inviting Team Members
```typescript
// POST /api/workspaces/invite
const response = await fetch('/api/workspaces/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: 'uuid',
    email: 'teammate@company.com',
    role: 'member'
  })
});
```

### API Routes with RLS
```typescript
// Use userClient() for authenticated user actions
import { userClient } from '@/lib/supabase/userClient';

export async function POST(req: NextRequest) {
  const sb = userClient();
  const { data: { user } } = await sb.auth.getUser();
  
  // RLS automatically filters by workspace membership
  const { data: contacts } = await sb
    .from('contacts')
    .select('*')
    .eq('workspace_id', workspaceId);
    
  // No need to call app.set_workspace!
}
```

## 🔄 Migration from app.set_workspace

### Before (Old Way)
```typescript
// ❌ Old approach
await sb.rpc('app.set_workspace', { id: workspaceId });
const { data } = await sb.from('contacts').select('*');
```

### After (New Way)
```typescript
// ✅ New approach - RLS handles filtering
const { data } = await sb
  .from('contacts')
  .select('*')
  .eq('workspace_id', workspaceId);
```

### Files to Update
The following files have been refactored:
- `src/app/api/sequences/save/route.ts`
- `src/app/api/contacts/recent/route.ts`
- `src/app/api/sequences/enroll/route.ts`
- `src/app/api/sequences/tick/route.ts`

## 🧪 Testing the Implementation

### 1. Create Workspace
1. Navigate to `/dashboard/workspaces`
2. Create a new workspace
3. Verify you're added as owner

### 2. Invite Team Member
1. Use the invite form with a colleague's email
2. Share the invitation link
3. Verify they can join with the correct role

### 3. Test RLS Policies
1. Sign in as User A, create Workspace A
2. Sign in as User B, verify no access to Workspace A
3. Invite User B as viewer, verify read-only access
4. Promote to member, verify write access

### 4. API Security
1. Test API endpoints with different user roles
2. Verify RLS blocks unauthorized access
3. Check that workspace_id is required in requests

## 🚨 Important Notes

### Webhook Endpoints
Keep using `adminClient()` for webhook endpoints:
- `/api/inbound/email`
- `/api/delivery/webhook`
- `/api/open`
- `/api/click`
- `/api/unsubscribe`

These bypass RLS but should still validate `workspaceId` via shared secrets.

### Environment Variables
Ensure these are set:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=your_app_url
```

### Database Permissions
The migration grants necessary permissions to authenticated users. If you encounter permission errors, verify:
1. RLS is enabled on tables
2. Policies are created correctly
3. User is authenticated
4. User has workspace membership

## 🔮 Future Enhancements

- **Email invitations**: Send actual emails instead of manual sharing
- **Role management UI**: Promote/demote team members
- **Workspace settings**: Customize workspace configuration
- **Audit logging**: Track who changed what
- **Billing integration**: Seat-based pricing tied to membership

## 🆘 Troubleshooting

### Common Issues

1. **"RLS policy denied" errors**
   - Check user authentication
   - Verify workspace membership
   - Ensure workspace_id is provided

2. **"Function app.is_member does not exist"**
   - Run the SQL migration
   - Check function creation in Supabase

3. **Permission denied on tables**
   - Verify RLS policies are created
   - Check user role in workspace
   - Ensure proper grants are applied

### Debug Queries
```sql
-- Check user's workspace memberships
select w.name, wm.role 
from workspace_members wm 
join workspaces w on w.id = wm.workspace_id 
where wm.user_id = auth.uid();

-- Test RLS policy
select app.is_member('workspace-uuid', 'member');
```

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Multi-tenant Best Practices](https://supabase.com/docs/guides/auth/row-level-security#multi-tenant-applications)
- [Workspace Management Patterns](https://supabase.com/docs/guides/auth/row-level-security#workspace-pattern)

---

**Status**: ✅ Implemented and ready for testing
**Next Steps**: Test with real data, implement email invitations, add role management UI 