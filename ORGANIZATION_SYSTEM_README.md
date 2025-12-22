# Organization & Seat Management System

This system provides multi-tenant organization management with role-based access control and seat-based billing integration.

## Features

- **Multi-tenant Organizations**: Users can belong to organizations with different roles
- **Role-Based Access Control**: Four roles (owner, admin, member, viewer) with different permissions
- **Seat Management**: Configurable seat limits with Stripe integration
- **Member Invitations**: Invite new team members with role assignment
- **Stripe Integration**: Automatic seat limit updates via webhooks

## Database Schema

### Organizations Table
```sql
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seat_limit int default 1,
  stripe_subscription_id text,
  created_at timestamptz default now()
);
```

### Organization Members Table
```sql
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member', -- owner|admin|member|viewer
  created_at timestamptz default now(),
  unique(org_id, user_id)
);
```

### Profiles Extension
```sql
alter table public.profiles
  add column if not exists org_id uuid references public.orgs(id);
```

## API Endpoints

### Create Organization
- **POST** `/api/orgs`
- **Body**: `{ "name": "Org Name", "user_id": "uuid" }`
- **Response**: Organization object

### List Organizations
- **GET** `/api/orgs`
- **Response**: Array of organizations

### Invite Member
- **POST** `/api/orgs/[id]/invite`
- **Body**: `{ "email": "user@example.com", "role": "member" }`
- **Response**: `{ "ok": true }`

### List Members
- **GET** `/api/orgs/[id]/members`
- **Response**: Array of members with profile information

## Role System

### Roles & Permissions

| Role | Campaigns | Invite | Members | Analytics | Billing |
|------|-----------|---------|---------|-----------|---------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Member | ✅ | ❌ | ❌ | ✅ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ | ❌ |

### Permission Functions
```typescript
import { canManageCampaigns, canInvite, canManageMembers } from '@/lib/auth/roles';

// Check if user can manage campaigns
const canManage = canManageCampaigns(userRole);

// Check if user can invite new members
const canInviteMembers = canInvite(userRole);
```

## Seat Management

### Seat Limits
- **Free Plan**: 1 seat (configurable via `ORG_FREE_SEAT_LIMIT` env var)
- **Pro Plan**: Unlimited or configurable limit (via `PRO_SEAT_LIMIT` env var)
- **Stripe Integration**: Automatic updates via webhooks

### Seat Validation
```typescript
import { hasAvailableSeats } from '@/lib/org-utils';

// Check if org can add more members
const canAddMember = await hasAvailableSeats(orgId);
```

## Stripe Integration

### Webhook Handler
- **Endpoint**: `/api/webhooks/stripe`
- **Events**: `customer.subscription.updated`, `customer.subscription.created`, `customer.subscription.deleted`

### Automatic Updates
- Subscription created/updated: Updates `seat_limit` from Stripe quantity
- Subscription deleted: Resets `seat_limit` to 1

## Usage Examples

### Creating an Organization
```typescript
const response = await fetch('/api/orgs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Team',
    user_id: currentUserId
  })
});

const org = await response.json();
```

### Inviting a Member
```typescript
const response = await fetch(`/api/orgs/${orgId}/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'teammate@example.com',
    role: 'member'
  })
});
```

### Checking Permissions
```typescript
import { checkPermission } from '@/lib/org-utils';

const canManageCampaigns = await checkPermission(
  userId,
  orgId,
  'manage_campaigns'
);
```

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Seat Limits
ORG_FREE_SEAT_LIMIT=1
PRO_SEAT_LIMIT=10
```

## Testing

### Test Plan
1. **Create Organization**: User creates org → becomes owner
2. **Invite Member**: Owner invites teammate → added as member
3. **Seat Limit**: Try to exceed limit → blocked with 402 error
4. **Role Enforcement**: Viewer tries campaign actions → blocked
5. **Stripe Integration**: Update subscription → seat limit updates

### Test Commands
```bash
# Test organization creation
curl -X POST http://localhost:3000/api/orgs \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Org","user_id":"user-uuid"}'

# Test member invitation
curl -X POST http://localhost:3000/api/orgs/org-uuid/invite \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"member"}'
```

## Security Considerations

- **Row Level Security**: All tables have RLS enabled
- **Role Validation**: API endpoints validate user roles before actions
- **Seat Enforcement**: Server-side validation prevents exceeding limits
- **Webhook Verification**: Stripe webhooks are signature-verified

## Future Enhancements

- **Multi-org Support**: Users can belong to multiple organizations
- **Advanced Roles**: Custom role definitions with granular permissions
- **Audit Logging**: Track all organization changes
- **Bulk Operations**: Invite multiple members at once
- **Role Inheritance**: Hierarchical role system 