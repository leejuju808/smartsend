# Unsubscribe Compliance Implementation

This document outlines the comprehensive unsubscribe and suppression enforcement system implemented in SmartSend AI.

## Overview

The system provides:
- **List-Unsubscribe headers** for email compliance
- **One-click unsubscribe** landing pages
- **Global suppression enforcement** before sending
- **Per-contact opt-out** capabilities
- **Comprehensive API endpoints** for programmatic access

## Architecture

### 1. Database Schema

The system uses the existing `suppression_list` table for global unsubscribes:

```sql
-- Already exists in your database
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  reason text default 'user_unsubscribed',
  source text default 'link',
  created_at timestamptz default now()
);

create index if not exists suppression_list_email_idx on public.suppression_list (email);
```

### 2. Core Components

#### Token Utilities (`/lib/unsub/token.ts`)
- Generates secure unsubscribe tokens using crypto
- Supports both immediate and time-based token generation
- Ready for JWT upgrade when package is available

#### Email Footer (`/lib/email/footer.ts`)
- Automatically appends unsubscribe links to all outbound emails
- Generates RFC-compliant List-Unsubscribe headers
- Supports both HTTP and mailto unsubscribe methods

#### Suppression Guard (`/lib/email/suppression.ts`)
- Checks global suppression list before sending
- Integrates with existing workspace-specific suppressions
- Provides unified suppression management

#### Send Wrapper (`/lib/email/send.ts`)
- Automatically checks suppressions before sending
- Injects compliance headers and footers
- Supports both single and bulk email operations

### 3. API Endpoints

#### POST `/api/unsubscribe`
Global unsubscribe endpoint supporting webhook-style unsubscribes:
```json
{
  "email": "user@example.com",
  "reason": "user_unsubscribed",
  "source": "api"
}
```

#### GET `/api/suppression/check?email=user@example.com`
Quick suppression status check:
```json
{
  "suppressed": true,
  "email": "user@example.com"
}
```

#### POST `/api/suppression/add`
Programmatic suppression addition:
```json
{
  "email": "user@example.com",
  "reason": "bounce",
  "source": "webhook"
}
```

### 4. User Interface

#### One-Click Unsubscribe (`/u/[token]`)
- Clean, responsive unsubscribe landing page
- Immediate feedback on unsubscribe status
- Integration with existing unsubscribe flow

#### Footer Component (`/components/email/UnsubscribeFooter.tsx`)
- Reusable unsubscribe component for forms
- Real-time unsubscribe status updates
- Consistent styling across the application

## Implementation Details

### Email Headers

Every outbound email automatically includes:
```
List-Unsubscribe: <https://yoursite.com/u/[token]>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### Footer Injection

All emails automatically append:
```
—

You are receiving this from SmartSend.
Unsubscribe: https://yoursite.com/u/[token]
```

### Suppression Enforcement

Before any email is sent:
1. Check global `suppression_list` table
2. Check workspace-specific suppressions (existing system)
3. Skip sending if email is suppressed
4. Log suppression reason for analytics

## Usage Examples

### Sending Emails Safely

```typescript
import { sendMailSafe } from "@/lib/email/send";

const result = await sendMailSafe({
  to: "user@example.com",
  subject: "Welcome to SmartSend",
  text: "Thanks for signing up!"
});

if (result.skipped) {
  console.log(`Skipped ${result.email}: ${result.reason}`);
}
```

### Bulk Email with Suppression

```typescript
import { sendBulkMailSafe } from "@/lib/email/send";

const results = await sendBulkMailSafe(
  ["user1@example.com", "user2@example.com"],
  "Weekly Update",
  "Here's your weekly summary..."
);

console.log(`Sent: ${results.sent}, Suppressed: ${results.suppressed}`);
```

### Adding Suppressions Programmatically

```typescript
import { addSuppression } from "@/lib/email/suppression";

await addSuppression("bounce@example.com", "webhook", "hard_bounce");
```

## Environment Variables

Add to your `.env.local`:
```bash
UNSUB_SECRET=replace_me_with_a_long_random_string
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Testing

Run the test suite:
```bash
npm test -- --testPathPattern="unsub|suppression"
```

## Integration Points

### Existing Systems
- **Campaign Queue**: Already checks suppressions before sending
- **Sequence Engine**: Respects unsubscribe status
- **Contact Import**: Validates against suppression list
- **Bounce Handling**: Automatically adds to suppressions

### Email Providers
The system is designed to work with any email provider:
- **MailerSend**: Headers and content injection
- **Brevo**: Compliance headers support
- **SMTP**: Standard email headers
- **Custom**: Extensible provider interface

## Compliance Benefits

### 1. Inbox Placement
- **List-Unsubscribe headers** improve deliverability
- **One-click unsubscribe** reduces complaints
- **Suppression enforcement** prevents bounces

### 2. Legal Compliance
- **CAN-SPAM Act** compliance
- **GDPR** right to be forgotten
- **CASL** unsubscribe requirements

### 3. User Trust
- **Transparent unsubscribe process**
- **Immediate opt-out confirmation**
- **No hidden unsubscribe barriers**

## Monitoring & Analytics

### Suppression Metrics
- Total suppressed emails
- Suppression reasons breakdown
- Unsubscribe rate trends
- Bounce vs. unsubscribe ratios

### Compliance Monitoring
- List-Unsubscribe header injection
- Suppression check success rate
- Unsubscribe link click-through rates

## Future Enhancements

### 1. JWT Token Upgrade
When `jsonwebtoken` package is available:
```typescript
// Replace crypto-based tokens with JWT
export function makeUnsubToken(email: string) {
  return jwt.sign({ email, t: "unsub" }, SECRET, { expiresIn: "90d" });
}
```

### 2. Advanced Suppression Rules
- Domain-level suppressions
- Campaign-specific opt-outs
- Time-based suppression expiration

### 3. Enhanced Analytics
- Unsubscribe reason tracking
- Suppression source attribution
- Compliance score metrics

## Troubleshooting

### Common Issues

1. **Emails still sending to suppressed addresses**
   - Check `suppression_list` table permissions
   - Verify `sendMailSafe` is being used
   - Check workspace suppression integration

2. **Unsubscribe links not working**
   - Verify `UNSUB_SECRET` environment variable
   - Check token generation in footer utility
   - Validate API endpoint responses

3. **Headers not being injected**
   - Ensure `listUnsubHeaders` is called
   - Check email provider header support
   - Verify email template integration

### Debug Mode

Enable detailed logging:
```typescript
// In development
console.log('Suppression check:', await isSuppressed(email));
console.log('Generated headers:', listUnsubHeaders(email));
```

## Security Considerations

### Token Security
- Tokens are cryptographically secure
- Time-based expiration prevents replay attacks
- Environment variable protection for secrets

### Data Privacy
- Email addresses are hashed in tokens
- Suppression data is encrypted at rest
- Access controls on suppression management

### Rate Limiting
- Unsubscribe API includes rate limiting
- Suppression checks are cached
- Bulk operations are throttled

## Conclusion

This implementation provides a robust, compliant unsubscribe system that:
- **Protects your domain reputation**
- **Ensures legal compliance**
- **Improves user experience**
- **Integrates seamlessly** with existing systems

The system is production-ready and follows email marketing best practices for deliverability and compliance. 