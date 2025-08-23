# Domain-Based Auto-Join System Implementation

This document describes the implementation of a domain-based auto-join system that allows teams to claim company domains and automatically add users with matching email domains to their team.

## Overview

The system works as follows:
1. **Team owners** claim company domains (e.g., `company.com`)
2. **DNS verification** is required via TXT records for security
3. **Auto-join** happens when users sign in with matching email domains
4. **Seat billing** automatically syncs with Stripe

## Database Schema

### `company_domains` table
```sql
create table public.company_domains (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  domain text not null unique,
  verified boolean default false,
  verify_token text,                    -- random token for DNS TXT
  created_at timestamptz default now(),
  verified_at timestamptz
);
```

## API Endpoints

### 1. Claim Domain
**POST** `/api/domains/claim`
- **Purpose**: Create a domain claim for a team
- **Auth**: Team owner/admin only
- **Body**: `{ "domain": "company.com" }`
- **Response**: DNS TXT record instructions

### 2. Verify Domain
**POST** `/api/domains/verify`
- **Purpose**: Verify domain ownership via DNS TXT
- **Auth**: Any authenticated user
- **Body**: `{ "domain": "company.com" }`
- **Response**: Success/failure status

### 3. List Domains
**GET** `/api/domains/list`
- **Purpose**: List all domains for a team
- **Auth**: Team members only
- **Response**: Array of domain objects

## DNS Verification

To verify domain ownership, add this TXT record:
```
_smartsend.company.com  TXT  smartsend-verify=<token>
```

The token is generated randomly when claiming the domain.

## Auto-Join Logic

### `autoJoinByDomain()` function
- **Location**: `src/lib/autoJoinByDomain.ts`
- **Triggered**: After successful authentication
- **Process**:
  1. Extract domain from user's email
  2. Check if domain is blocked (free email providers)
  3. Look for verified domain claims
  4. Auto-join user to team as member
  5. Sync seats to Stripe

### Blocked Domains
The following domains are automatically blocked from auto-join:
- gmail.com, yahoo.com, outlook.com, icloud.com, hotmail.com
- aol.com, protonmail.com, mail.com, yandex.com, zoho.com

## UI Components

### DomainClaimCard
- **Location**: `src/components/DomainClaimCard.tsx`
- **Purpose**: Allow team owners to claim and verify domains
- **Features**:
  - Domain input and validation
  - Claim and verify buttons
  - Display existing domains with status
  - Real-time updates

## Integration Points

### Auth Callback
- **File**: `src/app/auth/callback/route.ts`
- **Integration**: Calls `autoJoinByDomain()` after successful sign-in
- **Handles**: Both new signups and existing user logins

### Team Settings
- **File**: `src/app/dashboard/team/page.tsx`
- **Integration**: Shows DomainClaimCard for owners/admins
- **Access**: Team owners and admins only

## Security Features

1. **DNS Verification**: Prevents domain spoofing
2. **Role-Based Access**: Only owners/admins can manage domains
3. **Cross-Team Protection**: Prevents domain conflicts between teams
4. **RLS Policies**: Database-level access control

## Testing

### Run Migration
```bash
supabase db push
```

### Test Script
```bash
npx tsx scripts/test-domain-autojoin.ts
```

### Manual Testing
1. Claim a domain via the team settings
2. Add the DNS TXT record
3. Verify the domain
4. Sign in with a user from that domain
5. Verify auto-join works

## Workflow Example

1. **Team owner** goes to Team Settings
2. **Claims** `company.com` domain
3. **Adds DNS TXT** record: `_smartsend.company.com TXT smartsend-verify=abc123`
4. **Verifies** domain ownership
5. **Coworker** signs in with `jane@company.com`
6. **Auto-joins** team as member
7. **Seat count** increments in Stripe

## Error Handling

- **Domain already claimed**: Returns 409 Conflict
- **Invalid domain format**: Returns 400 Bad Request
- **DNS verification failed**: Returns 200 with failure message
- **Unauthorized access**: Returns 401/403 as appropriate

## Future Enhancements

1. **Email verification fallback**: Alternative to DNS TXT
2. **Domain expiration**: Auto-remove unverified claims
3. **Bulk domain import**: CSV upload for multiple domains
4. **Domain analytics**: Track auto-join success rates
5. **Advanced blocking**: Regex patterns for domain filtering 