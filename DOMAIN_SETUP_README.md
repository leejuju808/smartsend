# Domain Setup Wizard for Email Deliverability

This feature provides a comprehensive domain verification system to ensure optimal email deliverability by checking SPF, DKIM, DMARC, and tracking DNS records.

## 🚀 Features

- **DNS Record Verification**: Automatically checks SPF, DKIM, DMARC, and tracking CNAME records
- **Provider Support**: Built-in configurations for Brevo and MailerSend
- **Real-time Validation**: Live DNS checking with detailed results
- **User-friendly Interface**: Step-by-step wizard with clear instructions
- **Safety Integration**: Prevents sending from unverified domains
- **Persistent Storage**: Saves verification results in database

## 📋 Requirements

- Node.js 18+ with DNS resolution capabilities
- Supabase database with the `sender_domains` table
- Access to domain registrar for DNS management

## 🗄️ Database Schema

The system uses a `sender_domains` table with the following structure:

```sql
create table public.sender_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  provider text default 'brevo',
  dkim_selector text default 'mail',
  tracking_subdomain text default 't',
  verified boolean default false,
  last_check jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## 🔧 Installation

### 1. Database Migration

Run the migration to create the required table:

```bash
supabase db push
```

### 2. Environment Variables

Ensure these environment variables are set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. API Route

The domain check API is available at `/api/domain/check` and handles:

- DNS record validation
- Provider-specific configurations
- Result storage in database

## 🎯 Usage

### For Users

1. **Navigate to Domain Setup**: Go to `/dashboard/domain-setup`
2. **Enter Domain Details**: 
   - Domain name (e.g., `yourdomain.com`)
   - Email provider (Brevo or MailerSend)
   - DKIM selector (usually `mail`)
   - Tracking subdomain (usually `t`)
3. **Run DNS Check**: Click "Run DNS Check" to validate records
4. **Fix Issues**: Add missing DNS records at your registrar
5. **Re-check**: Run the check again after adding records

### For Developers

#### Domain Verification Check

```typescript
import { isDomainVerified } from "@/lib/email/domain-verification";

// Check if a domain is verified
const verified = await isDomainVerified("noreply@yourdomain.com");
if (!verified) {
  // Handle unverified domain
}
```

#### Integration with Email Sending

```typescript
import { sendMailSafe } from "@/lib/email/send";

// The sendMailSafe function automatically checks domain verification
const result = await sendMailSafe({
  to: "recipient@example.com",
  from: "noreply@yourdomain.com", // Domain will be verified
  subject: "Test Email",
  text: "Hello World"
});

if (result.skipped && result.reason === "domain_unverified") {
  // Handle unverified domain case
}
```

## 🔍 DNS Records Required

### SPF Record
**Type**: TXT  
**Name**: `@` (root domain)  
**Value**: 
- Brevo: `v=spf1 include:spf.brevo.com ~all`
- MailerSend: `v=spf1 include:_spf.mailersend.net ~all`

### DKIM Record
**Type**: TXT  
**Name**: `mail._domainkey.yourdomain.com`  
**Value**: Provided by your email provider

### DMARC Record
**Type**: TXT  
**Name**: `_dmarc.yourdomain.com`  
**Value**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100`

### Tracking CNAME
**Type**: CNAME  
**Name**: `t.yourdomain.com`  
**Value**: 
- Brevo: `uXXXXX.wl.sendgrid.net` (from Brevo dashboard)
- MailerSend: `track.mailersend.net`

## 🧪 Testing

### Run Test Suite

```bash
npx tsx scripts/test-domain-verification.ts
```

### Manual Testing

1. **API Testing**: Use Postman/curl to test `/api/domain/check`
2. **UI Testing**: Visit `/dashboard/domain-setup` and test with real domains
3. **Integration Testing**: Test domain verification in campaign creation

### Example API Request

```bash
curl -X POST /api/domain/check \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "yourdomain.com",
    "provider": "brevo",
    "selector": "mail",
    "trackSub": "t"
  }'
```

## 🚨 Troubleshooting

### Common Issues

1. **DNS Propagation**: Wait 5-10 minutes after adding records
2. **Incorrect Record Types**: Ensure SPF/DMARC are TXT, tracking is CNAME
3. **Provider Mismatch**: Verify you're using the correct provider configuration
4. **Authentication**: Ensure user is logged in to access the API

### Debug Mode

Enable detailed logging by checking browser console and server logs for:
- DNS resolution errors
- Database connection issues
- Authentication failures

## 🔒 Security Considerations

- **Authentication Required**: All API endpoints require user authentication
- **Rate Limiting**: Consider implementing rate limiting for DNS checks
- **Input Validation**: Domain names are validated and sanitized
- **Service Role Key**: API uses service role key for database access

## 📈 Performance

- **DNS Caching**: Results are stored in database to avoid repeated lookups
- **Async Processing**: DNS checks are performed asynchronously
- **Efficient Queries**: Database queries use proper indexing

## 🔄 Future Enhancements

- **Bulk Domain Verification**: Check multiple domains simultaneously
- **Automatic Re-checking**: Scheduled verification of existing domains
- **Provider Integration**: Direct integration with email provider APIs
- **Advanced DNS Validation**: Support for additional record types
- **Email Templates**: Pre-built email templates for domain setup

## 📚 Resources

- [SPF Record Format](https://tools.ietf.org/html/rfc7208)
- [DKIM Specification](https://tools.ietf.org/html/rfc6376)
- [DMARC Policy](https://tools.ietf.org/html/rfc7489)
- [Brevo Documentation](https://help.brevo.com/)
- [MailerSend Documentation](https://www.mailersend.com/help/)

## 🤝 Contributing

To contribute to this feature:

1. Follow the existing code style
2. Add tests for new functionality
3. Update documentation for any changes
4. Ensure backward compatibility

## 📄 License

This feature is part of the SmartSend application and follows the same licensing terms. 