# Custom Domain + DKIM Setup

This implementation adds custom domain support with DKIM setup for SmartSend AI, allowing workspaces to connect branded tracking domains and prepare for direct email sending.

## Features

- **Custom Domain Registration**: Connect subdomains (e.g., `send.acme.com`) for branded tracking links
- **Automatic DNS Record Generation**: Creates CNAME, TXT (ownership), and DKIM records
- **DNS Verification**: Real-time checking via Node DNS lookups
- **Clean UI**: Checklist-style interface for domain setup
- **Pro Plan Gating**: Easily gate to Pro plan users (commented out in current implementation)
- **RLS Security**: Row-level security policies for workspace isolation

## Database Schema

### Tables

1. **custom_domains** - Stores domain registrations
   - `id` - UUID primary key
   - `workspace_id` - FK to workspaces
   - `hostname` - Full hostname (e.g., "send.acme.com")
   - `tracking_subdomain` - Subdomain part (e.g., "send")
   - `root_domain` - Root domain (e.g., "acme.com")
   - `status` - pending|verified|failed
   - `created_at`, `verified_at` - Timestamps

2. **domain_dns_records** - DNS record configurations
   - `id` - UUID primary key
   - `domain_id` - FK to custom_domains
   - `type` - CNAME or TXT
   - `host` - DNS hostname
   - `value` - DNS value
   - `required` - Whether record is required for verification
   - `verified` - Whether record is currently verified

### RLS Policies

- Users can read domains for workspaces they're members of
- Only editors can write domains
- Only admins can delete domains
- DNS records inherit domain permissions

## API Endpoints

### `POST /api/domains/create`

Creates a new custom domain and generates required DNS records.

**Request:**
```json
{
  "workspace_id": "uuid",
  "hostname": "send.acme.com"
}
```

**Response:**
```json
{
  "ok": true,
  "domain_id": "uuid"
}
```

### `GET /api/domains/[id]/records`

Fetches domain details and DNS records.

**Response:**
```json
{
  "domain": {
    "id": "uuid",
    "hostname": "send.acme.com",
    "status": "pending",
    ...
  },
  "records": [
    {
      "id": "uuid",
      "type": "CNAME",
      "host": "send.acme.com",
      "value": "trk.smartsend.ai.",
      "verified": false,
      "required": true
    },
    ...
  ]
}
```

### `POST /api/domains/[id]/verify`

Verifies DNS records by performing actual DNS lookups.

**Response:**
```json
{
  "ok": true
}
```

## DNS Records Generated

For a domain like `send.acme.com`, the system creates:

1. **CNAME Record**
   - Host: `send.acme.com`
   - Value: `trk.smartsend.ai.`
   - Purpose: Points tracking subdomain to SmartSend infrastructure

2. **TXT Record (Ownership Verification)**
   - Host: `smartsend-verify.acme.com`
   - Value: `smartsend-site-verification=<random_token>`
   - Purpose: Proves domain ownership

3. **TXT Record (DKIM)**
   - Host: `smartsend._domainkey.acme.com`
   - Value: `v=DKIM1; k=rsa; p=<public_key>`
   - Purpose: DKIM signing for future email sending

## Setup Instructions

### 1. Run Migration

Apply the database schema:

```bash
# Using Supabase CLI
supabase db push

# Or via SQL editor
psql < supabase/migrations/custom_domains.sql
```

### 2. Configure Environment

Add to your `.env.local`:

```bash
TRACKING_EDGE_HOST=trk.smartsend.ai
```

### 3. Deploy Changes

Deploy the new API routes and UI:

```bash
npm run build
# Deploy to Vercel/production
```

### 4. Access UI

Navigate to: `/dashboard/domains?ws=<workspace_id>`

## Usage Flow

1. **Connect Domain**: User enters subdomain (e.g., `send.acme.com`)
2. **System Generates DNS Records**: Creates CNAME, TXT (ownership), and DKIM records
3. **User Adds to DNS**: Copies records to their DNS provider
4. **Verify**: Clicks "Verify DNS" button
5. **System Checks**: Performs DNS lookups to verify records
6. **Activate**: Once verified, domain status updates to "verified"

## Integration with Tracking

Once a domain is verified, you can update your tracking system to use the custom domain:

```typescript
// Example: Use custom domain for tracking links
const domain = await getVerifiedDomain(workspaceId);
const trackingUrl = domain 
  ? `https://${domain.hostname}/r/${token}`
  : `https://trk.smartsend.ai/r/${token}`;
```

## Pro Plan Gating (Optional)

To gate this feature to Pro users, uncomment and implement in `/api/domains/create/route.ts`:

```typescript
const gate = await checkFeature(workspace_id, "custom_domains");
if (!gate.ok) return NextResponse.json(gate, { status: 402 });
```

## Security Considerations

1. **Private DKIM Keys**: Currently stored in database (not recommended for production)
   - Recommendation: Use AWS KMS, Azure Key Vault, or similar
   - Update in `POST /api/domains/create` to store keys securely

2. **RLS Policies**: All data access controlled by workspace membership
3. **DNS Verification**: Prevents unauthorized domain claims

## Troubleshooting

### DNS Not Propagating

- TXT records can take 15-30 minutes to propagate
- Use `dig` to check DNS locally: `dig TXT smartsend._domainkey.acme.com`
- Verify with multiple DNS servers

### Verification Failing

- Check DNS records are correctly formatted
- Ensure trailing dot in CNAME values
- Verify no extra spaces in TXT records

### "Invalid hostname" Error

- Must have at least 2 parts (subdomain.root)
- Examples: `send.acme.com` ✓, `acme.com` ✗

## Future Enhancements

1. **DKIM Key Rotation**: Support for rotating DKIM keys
2. **SPF/DMARC Records**: Generate SPF and DMARC records
3. **Bulk Domain Import**: Import multiple domains via CSV
4. **Email Domain Verification**: Verify email sending domain separately
5. **Auto-Verification**: Poll DNS periodically and auto-verify when ready

## Testing

Test the full flow:

```bash
# 1. Create a domain
curl -X POST http://localhost:3000/api/domains/create \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "your-workspace-id", "hostname": "test.example.com"}'

# 2. Get DNS records
curl http://localhost:3000/api/domains/<domain-id>/records

# 3. After adding DNS records, verify
curl -X POST http://localhost:3000/api/domains/<domain-id>/verify
```

## Files Changed

- `supabase/migrations/custom_domains.sql` - Database schema
- `src/lib/domains.ts` - Helper functions for DKIM, hostname parsing
- `src/app/api/domains/create/route.ts` - Create domain endpoint
- `src/app/api/domains/[id]/records/route.ts` - List records endpoint
- `src/app/api/domains/[id]/verify/route.ts` - Verify DNS endpoint
- `src/app/dashboard/domains/page.tsx` - UI component

## Support

For issues or questions, check:
- [SmartSend Documentation](https://docs.smartsend.ai)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security) 