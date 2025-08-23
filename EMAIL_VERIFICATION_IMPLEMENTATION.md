# Email Verification System for Domain Claims

This document describes the implementation of an email verification system that allows team owners/admins to verify domain ownership via email codes instead of DNS TXT records.

## Overview

The system provides an alternative to DNS verification for claiming company domains. Users can:
1. Request a 6-character verification code sent to any email at their domain
2. Enter the code to verify domain ownership
3. Enable auto-join for new users with that domain

## Database Changes

### New Table: `company_domain_email_verifications`

```sql
create table if not exists public.company_domain_email_verifications (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_by uuid not null,         -- requester user id
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_cdev_domain on public.company_domain_email_verifications(domain);
create index if not exists idx_cdev_email on public.company_domain_email_verifications(email);
create index if not exists idx_cdev_expires on public.company_domain_email_verifications(expires_at);
create index if not exists idx_cdev_used on public.company_domain_email_verifications(used);
```

### Row Level Security (RLS)

The table is protected by RLS policies that ensure only team owners/admins can:
- View verifications for domains their team owns
- Insert new verification codes
- Update verification status

## API Endpoints

### 1. Request Verification Code

**Endpoint:** `POST /api/domains/email/request`

**Request Body:**
```json
{
  "email": "owner@company.com"
}
```

**Response:**
```json
{
  "ok": true,
  "expires_at": "2025-01-20T15:30:00Z"
}
```

**Features:**
- Role-gated to owner/admin only
- Blocks public email domains (gmail.com, yahoo.com, etc.)
- Rate limited to 3 active codes per domain
- 15-minute expiration
- Auto-creates domain claim if none exists

### 2. Verify Code

**Endpoint:** `POST /api/domains/email/verify`

**Request Body:**
```json
{
  "email": "owner@company.com",
  "code": "ABC123"
}
```

**Response:**
```json
{
  "ok": true,
  "domain": "company.com"
}
```

**Features:**
- Validates code format and expiration
- Marks code as used
- Updates domain verification status
- Prevents cross-team domain conflicts

## UI Components

### Updated DomainClaimCard

The existing `DomainClaimCard` component has been enhanced with:

1. **Email Verify Button**: New button alongside DNS Claim/Verify
2. **Email Modal**: Two-step verification process:
   - Step 1: Enter email address
   - Step 2: Enter verification code
3. **Real-time Feedback**: Success/error messages and loading states

### User Flow

1. User clicks "Email Verify" button
2. Modal opens with email input (pre-filled with owner@domain.com)
3. User clicks "Send code" → API sends 6-char code
4. Modal switches to code input step
5. User enters code and clicks "Verify"
6. On success: domain marked verified, modal closes, list refreshes

## Security Features

### Access Control
- Only team owners/admins can request/verify codes
- Role verification on every API call

### Rate Limiting
- Maximum 3 active codes per domain
- Prevents abuse and spam

### Domain Validation
- Blocks public email providers
- Prevents cross-team domain conflicts
- Validates email format

### Code Security
- 6-character random hex codes (e.g., "A9B3F1")
- 15-minute expiration
- Single-use codes (marked as used after verification)

## Email Integration

### Current Implementation
- Uses placeholder `/api/emails/send` endpoint
- Logs emails to console for development
- Ready for integration with email service

### Recommended Email Services
- **Resend**: Simple API, good deliverability
- **SendGrid**: Enterprise-grade, extensive features
- **Postmark**: Transactional email specialist

### Integration Example (Resend)
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send({
  from: 'noreply@yourdomain.com',
  to: [email],
  subject: `Your SmartSendAI verification code: ${code}`,
  text: `Use this code to verify ${domain}: ${code}\nIt expires in 15 minutes.`
});
```

## Database Migration

Run this migration in your Supabase SQL editor:

```sql
-- File: supabase/migrations/20250120_add_email_verification_codes.sql
-- Run the complete SQL from the migration file
```

## Testing

### Manual Testing
1. Navigate to Team Settings → Domain card
2. Click "Email Verify" button
3. Enter email address
4. Check console for verification code
5. Enter code and verify
6. Confirm domain shows as verified

### API Testing
```bash
# Request code
curl -X POST /api/domains/email/request \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@company.com"}'

# Verify code
curl -X POST /api/domains/email/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@company.com","code":"ABC123"}'
```

## Benefits

1. **Faster Domain Claims**: No DNS configuration required
2. **Higher Conversion**: Removes technical barriers for ops-light teams
3. **Immediate Results**: Verification happens in minutes, not hours/days
4. **User-Friendly**: Simple email + code workflow
5. **Secure**: Maintains all security features of DNS verification

## Future Enhancements

1. **Email Service Integration**: Connect to Resend/SendGrid
2. **Template Customization**: Allow teams to customize email content
3. **Bulk Verification**: Support for multiple domains
4. **Audit Logging**: Track verification attempts and successes
5. **Advanced Rate Limiting**: Per-user and per-domain limits

## Troubleshooting

### Common Issues

1. **"Too many requests"**: Wait for existing codes to expire (15 min)
2. **"Invalid code"**: Check code format and ensure it hasn't expired
3. **"Domain claimed by another team"**: Contact support to resolve conflicts
4. **Email not received**: Check spam folder, verify email address

### Debug Mode
Enable console logging by checking the browser console for:
- API request/response logs
- Email sending attempts
- Verification code generation 