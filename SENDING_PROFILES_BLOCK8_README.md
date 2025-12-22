# Block 8: Sending Profiles Implementation

## Overview
This implementation adds a comprehensive sending profiles system that allows users to configure multiple sending profiles (SMTP, Resend, SendGrid, Mailgun, Postmark) with automatic signature injection and sender information application.

## Files Created

### 1. Database Migration
**`supabase/migrations/0013_sending_profiles.sql`**
- Creates `email_provider` enum (smtp, resend, sendgrid, mailgun, postmark)
- Creates `public.sending_profiles` table (public configuration)
- Creates `private.sending_profile_secrets` table (API keys and credentials)
- Adds `default_sending_profile` to projects table
- Adds `sending_profile_id` to threads table for overrides
- Implements RLS policies for both tables
- Creates `resolve_profile()` function to determine which profile to use
- Creates `apply_sending_profile()` trigger on emails INSERT to auto-fill sender and append signatures

### 2. Edge Function
**`supabase/functions/upsert-profile/index.ts`**
- Secure secret storage endpoint (service role only)
- Supports SMTP and API-based providers
- Upserts secrets into the private schema

### 3. Settings UI
**`src/app/settings/sending-profiles/page.tsx`**
- Create and manage sending profiles
- Configure provider credentials securely
- Set project default profile
- List all profiles with quick set-default action

### 4. Thread Profile Picker
**`src/components/replies/ThreadProfilePicker.tsx`**
- Dropdown to override default profile per-thread
- Integrated into ThreadView component
- Auto-loads current selection

## How It Works

### 1. Profile Resolution Logic
```
Thread-level override → Project default → None
```

The `resolve_profile()` function checks in order:
1. If thread has `sending_profile_id` set, use that
2. Else if project has `default_sending_profile`, use that
3. Else return null (no profile applied)

### 2. Automatic Application (Trigger)
When an outbound email is inserted into the `emails` table:
1. `apply_sending_profile()` trigger fires
2. Looks up active profile via `resolve_profile()`
3. If sender is empty/null, fills with `From Name <from@email.com>`
4. Appends signature HTML if not already in body

### 3. Secret Storage
- Public profile stores only non-secret info (name, from_email, from_name, signature)
- Secrets stored in `private.sending_profile_secrets` (RLS blocks normal users)
- Edge function `/functions/v1/upsert-profile` handles secure upsert
- UI never exposes secrets to browser

## Usage

### Creating a Profile
1. Navigate to Settings → Sending Profiles
2. Fill in:
   - Profile name (e.g., "Sales (Julian)")
   - Provider (SMTP, Resend, etc.)
   - From name and email
   - Optional signature HTML
   - Provider credentials (host/port/user/pass for SMTP, or API key for others)
3. Click "Create profile"
4. Optionally click "Set default" to make it the project default

### Using in Threads
1. Open any thread in the replies view
2. Use the profile dropdown in the header (top right)
3. Select "Default profile" or a specific profile
4. All subsequent outbound emails from this thread use that profile

## Testing Checklist

- [ ] Create profile in Settings → Save secrets via Edge function → Set as Project Default
- [ ] Send reply from thread (composer) → `sender` auto-fills with From Name <from@domain>
- [ ] Email body includes signature HTML appended (if not already present)
- [ ] Outbox worker delivers using provider creds for that profile
- [ ] Override per thread with picker → Send again → See new sender and signature

## Security Notes

- `private.sending_profile_secrets` has RLS that blocks all normal user access
- Only service role (edge functions) can read/write secrets
- UI never fetches secrets; they are only stored via the edge function
- Migration creates `private` schema if it doesn't exist

## Deployment

1. Apply migration to Supabase:
   ```bash
   # Copy contents of 0013_sending_profiles.sql
   # Paste into Supabase Dashboard → SQL Editor → Run
   ```

2. Deploy edge function:
   ```bash
   supabase functions deploy upsert-profile --no-verify-jwt
   ```

3. Deploy UI:
   ```bash
   npm run build && npm start
   ```

4. Verify:
   - Go to /settings/sending-profiles
   - Create a test profile
   - Send an email from a thread
   - Check that sender and signature are applied

## Next Steps (Not Included)

- Integration with existing outbound workers (sequence-compiler, queue-dispatcher)
- Provider-specific sending logic (Resend API, SendGrid API, etc.)
- Signature template variables ({{name}}, {{email}}, etc.)
- Profile health monitoring and rotation

## API Reference

### RPC: `resolve_profile(project_id, thread_id)`
Returns the UUID of the profile to use, or null.
```sql
SELECT public.resolve_profile('project-uuid', 'thread-uuid' or null);
```

### Trigger: `apply_sending_profile`
Automatically applied on `public.emails` INSERT. No manual call needed.

### Edge Function: `upsert-profile`
```typescript
POST /functions/v1/upsert-profile
Body: { profile_id, provider, secrets: { host, port, user, pass, secure } }
// OR for API providers:
Body: { profile_id, provider, secrets: { api_key, domain } }
```

## Database Schema

```
public.sending_profiles
├── id (uuid, PK)
├── project_id (uuid, FK → projects)
├── name (text)
├── provider (enum: smtp|resend|sendgrid|mailgun|postmark)
├── from_name (text)
├── from_email (text)
├── signature_html (text, nullable)
├── is_active (boolean)
└── created_at (timestamptz)

private.sending_profile_secrets
├── profile_id (uuid, PK, FK → sending_profiles)
├── smtp_host (text, nullable)
├── smtp_port (int, nullable)
├── smtp_user (text, nullable)
├── smtp_pass (text, nullable)
├── smtp_secure (boolean, nullable)
├── api_key (text, nullable)
├── domain (text, nullable)
└── inserted_at (timestamptz)

public.projects
└── default_sending_profile (uuid, FK → sending_profiles, nullable)

public.threads
└── sending_profile_id (uuid, FK → sending_profiles, nullable)
```

## Rollback

If you need to rollback:
```sql
-- Drop trigger
DROP TRIGGER IF EXISTS trg_emails_apply_profile ON public.emails;

-- Drop functions
DROP FUNCTION IF EXISTS public.apply_sending_profile();
DROP FUNCTION IF EXISTS public.resolve_profile(uuid, uuid);

-- Drop columns
ALTER TABLE public.threads DROP COLUMN IF EXISTS sending_profile_id;
ALTER TABLE public.projects DROP COLUMN IF EXISTS default_sending_profile;

-- Drop tables
DROP TABLE IF EXISTS private.sending_profile_secrets;
DROP TABLE IF EXISTS public.sending_profiles;

-- Drop enum
DROP TYPE IF EXISTS email_provider;
```

