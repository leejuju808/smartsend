# SmartSend Unsubscribe & Preferences Center

A comprehensive compliance and deliverability system that provides one-click unsubscribe, preferences management, and per-sequence opt-outs for email sequences.

## 🎯 Features

- **One-Click Unsubscribe**: Tokenized links that work without login
- **Preferences Center**: Public page for managing email preferences
- **Per-Sequence Opt-Outs**: Allow users to opt out of specific sequences
- **Global Unsubscribe**: Complete opt-out from all emails
- **Audit Trail**: Complete logging of all unsubscribe actions
- **Automatic Enforcement**: Blocks suppressed emails before sending
- **Compliance Ready**: Meets CAN-SPAM and GDPR requirements

## 🏗️ Architecture

### Database Schema

The system uses four main tables:

1. **`unsubscribe_tokens`** - Secure tokens for unsubscribe links
2. **`email_preferences`** - User preferences and global opt-outs
3. **`sequence_opt_outs`** - Per-sequence unsubscribe tracking
4. **`unsubscribe_events`** - Audit trail of all actions

### Key Components

- **`/lib/unsub/utils.ts`** - Core utility functions
- **`/app/u/page.tsx`** - Public preferences page
- **`/app/api/unsubscribe/*`** - API endpoints
- **`/app/dashboard/preferences/page.tsx`** - Admin dashboard
- **Integration with sequence sending** - Automatic enforcement

## 🚀 Quick Start

### 1. Environment Setup

Add to your `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_UNSUB_PAGE_BRAND=SmartSend
NEXT_PUBLIC_DEMO_WORKSPACE_ID=your-workspace-id
```

### 2. Database Migration

Run the SQL migration in your Supabase SQL editor:

```sql
-- See: supabase/migrations/20250129_create_unsubscribe_preferences_center.sql
```

### 3. Test the System

Run the test script:

```bash
npm run tsx scripts/test-unsubscribe-system.ts
```

## 📱 Usage

### For Users

Users receive emails with unsubscribe links in the footer:

```
Prefer fewer emails? Manage preferences here: https://yoursite.com/u?token=abc123...
```

Clicking the link takes them to `/u?token=...` where they can:
- Unsubscribe from all emails
- Opt out of the specific sequence
- See their current preferences

### For Developers

#### Creating Unsubscribe Links

```typescript
import { makeUnsubLink } from '@/lib/unsub/utils';

const unsubUrl = await makeUnsubLink(
  workspaceId, 
  email, 
  sequenceId, 
  subscriberId
);
```

#### Checking Suppression Status

```typescript
import { isSuppressedFor } from '@/lib/unsub/utils';

const status = await isSuppressedFor(workspaceId, email, sequenceId);
if (status.blocked) {
  console.log('Email blocked:', status.reason);
  // Don't send email
}
```

#### Applying Unsubscribes

```typescript
import { applyGlobalUnsub, applySequenceUnsub } from '@/lib/unsub/utils';

// Global unsubscribe
await applyGlobalUnsub(workspaceId, email, {
  reason: 'user-request',
  ua: userAgent,
  ip: userIP
});

// Sequence-specific unsubscribe
await applySequenceUnsub(workspaceId, email, sequenceId, {
  reason: 'sequence-opt-out',
  ua: userAgent,
  ip: userIP
});
```

## 🔧 Integration

### Sequence Sending

The system automatically integrates with sequence sending:

1. **Pre-send Check**: Verifies email isn't suppressed
2. **Footer Injection**: Adds unsubscribe link to every email
3. **Status Updates**: Marks subscribers as unsubscribed if needed

### Email Templates

Use the `{{unsubscribe_url}}` variable in your templates:

```html
<p>Your email content here...</p>
<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
```

## 📊 Admin Dashboard

Access `/dashboard/preferences` to view:

- Recent unsubscribe events
- Global opt-outs
- Sequence-specific opt-outs
- Statistics and trends

## 🧪 Testing

### Manual Testing

1. Send yourself a sequence email
2. Click the "Manage preferences" link
3. Test both unsubscribe options
4. Verify emails are blocked in future sends

### Automated Testing

The test script verifies:

- Token generation
- Suppression checks
- Unsubscribe application
- Status updates

## 🔒 Security & Privacy

- **Token-based**: No login required for unsubscribe
- **Workspace Isolation**: RLS policies prevent cross-workspace access
- **Audit Trail**: Complete logging of all actions
- **IP Tracking**: Records user IP for compliance
- **Token Expiration**: Optional 90-day token expiry

## 📈 Compliance Benefits

- **CAN-SPAM**: One-click unsubscribe requirement met
- **GDPR**: Right to be forgotten supported
- **Deliverability**: Reduces complaints and bounces
- **Trust**: Transparent preference management
- **Audit**: Complete compliance trail

## 🚨 Troubleshooting

### Common Issues

1. **Tokens not working**: Check database connection and RLS policies
2. **Emails still sending**: Verify `isSuppressedFor` is called before sending
3. **Missing footers**: Ensure `makeUnsubLink` is called and footer is injected

### Debug Mode

Enable debug logging:

```typescript
// Add to your environment
DEBUG_UNSUB=true
```

## 🔮 Future Enhancements

- **Topic Preferences**: Per-category subscriptions
- **Resubscribe Flow**: Easy re-engagement
- **Bulk Management**: Admin tools for bulk operations
- **Analytics**: Unsubscribe rate tracking
- **A/B Testing**: Footer optimization

## 📚 API Reference

### Endpoints

- `GET /api/unsubscribe/resolve?token=...` - Resolve token and get preferences
- `POST /api/unsubscribe/apply` - Apply unsubscribe action

### Functions

- `makeUnsubLink()` - Generate unsubscribe URL
- `isSuppressedFor()` - Check if email is blocked
- `applyGlobalUnsub()` - Apply global unsubscribe
- `applySequenceUnsub()` - Apply sequence-specific unsubscribe

## 🤝 Contributing

When adding new features:

1. Update the database schema
2. Add utility functions
3. Update the admin dashboard
4. Add tests
5. Update documentation

## 📄 License

This system is part of SmartSend and follows the same licensing terms. 