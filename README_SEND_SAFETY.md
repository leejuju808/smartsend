# SmartSendAI — Send Safety System

This implements comprehensive send safety guardrails for email campaigns, preventing bad sends and improving deliverability.

## Features

- **Duplicate Detection**: Automatically identifies and skips duplicate emails within campaigns
- **Suppression Management**: Blocks emails that have unsubscribed or been suppressed
- **Database Enforcement**: Hard blocks at DB level, even if client-side validation fails
- **Real-time Stats**: Shows campaign health metrics before sending
- **Safe Enqueuing**: Filters and queues only valid, unique, non-suppressed emails

## Files Created

- `lib/send/checkSendSafety.ts` - Core functions for safety checks and enqueuing
- `app/dashboard/campaigns/[id]/page.tsx` - Campaign details page with safety UI
- `supabase/sql/send_safety.sql` - Database schema and RPC functions

## Setup Instructions

### 1. Install Dependencies

```bash
npm i @supabase/supabase-js
```

### 2. Apply Database Schema

1. Open your Supabase dashboard
2. Go to SQL Editor → New Query
3. Paste the entire contents of `supabase/sql/send_safety.sql`
4. Run the query

**Note**: This assumes you already have these tables:
- `public.profiles(id uuid primary key)`
- `public.contacts(...)`
- `public.suppressions(...)`
- `public.normalize_email(text)` function

### 3. Test the System

#### Quick Test Data Setup

Replace the UUIDs with your real `auth.uid()` for testing:

```sql
-- Set your user ID for testing
select set_config('request.jwt.claim.sub', 'YOUR-USER-ID-HERE', true);

-- Create a test campaign
insert into public.campaigns (id, profile_id, name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'YOUR-USER-ID-HERE', 'Test Campaign')
on conflict (id) do nothing;

-- Add test contacts (including duplicates)
insert into public.contacts (profile_id, email, first_name) values
('YOUR-USER-ID-HERE', 'alice@EXAMPLE.com', 'Alice'),
('YOUR-USER-ID-HERE', 'alice@example.com', 'AliceDup'),
('YOUR-USER-ID-HERE', 'bob@example.com', 'Bob')
on conflict do nothing;

-- Join contacts to campaign
insert into public.campaign_contacts (profile_id, campaign_id, contact_id)
select 'YOUR-USER-ID-HERE',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       id
from public.contacts
where profile_id = 'YOUR-USER-ID-HERE'
  and email in ('alice@example.com','alice@example.com','bob@example.com')
on conflict do nothing;

-- Suppress Alice
insert into public.suppressions (profile_id, email, reason)
values ('YOUR-USER-ID-HERE', 'alice@example.com', 'unsubscribed')
on conflict do nothing;
```

#### Test the UI

1. Start your dev server: `npm run dev`
2. Navigate to: `/dashboard/campaigns/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
3. Verify the stats show:
   - Rows (raw): 3
   - Distinct emails: 2
   - Duplicates in campaign: 1
   - Suppressed: 1 (Alice)
   - Sendable: 1 (Bob)

4. Click "Send 1 safely"
5. Check the results show:
   - Queued: 1
   - Skipped (suppressed): 1
   - Skipped (duplicates): 1

### 4. Database Verification

```sql
-- Check queued messages
select to_email, status from public.messages
where campaign_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Should show: bob@example.com, queued

-- Try to suppress Bob and send again
insert into public.suppressions (profile_id, email, reason)
values ('YOUR-USER-ID-HERE', 'bob@example.com', 'test')
on conflict do nothing;

-- Send safely again - should queue 0
```

## How It Works

### Safety Layers

1. **UI Level**: Shows warnings and prevents sending when issues detected
2. **Application Level**: Functions filter duplicates and suppressions before enqueuing
3. **Database Level**: Triggers block suppressed emails and normalize addresses
4. **Constraint Level**: Unique indexes prevent duplicate campaign-contact pairs

### Key Functions

- `compute_campaign_send_safety()`: Analyzes campaign health
- `enqueue_campaign_safely()`: Safely queues messages after filtering
- `tg_block_suppressed_messages()`: Database trigger blocking suppressed emails
- `tg_normalize_to_email()`: Normalizes email addresses on insert

### Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **Function Security**: RPCs run with invoker's permissions
- **Input Validation**: Email normalization and validation at multiple levels

## Customization

### Adding New Safety Rules

1. Modify the `compute_campaign_send_safety` function to include new metrics
2. Update the `enqueue_campaign_safely` function to filter based on new rules
3. Add corresponding UI elements in the campaign page

### Integration with Existing Systems

- The system works alongside existing contact management
- Campaigns can be created through your existing workflow
- Messages table integrates with your email sending infrastructure

## Troubleshooting

### Common Issues

1. **"Not authenticated" error**: Ensure user is logged in and `auth.uid()` is available
2. **Missing tables**: Run the SQL in order, ensuring dependencies exist first
3. **Permission errors**: Check that RLS policies are correctly applied
4. **Function not found**: Verify the RPC functions were created successfully

### Debug Queries

```sql
-- Check if functions exist
select routine_name from information_schema.routines 
where routine_schema = 'public' 
and routine_name like '%send_safety%';

-- Check RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual 
from pg_policies 
where tablename in ('campaigns', 'campaign_contacts', 'messages');
```

## Next Steps

1. **Email Sending**: Integrate the `messages` table with your email service
2. **Campaign Management**: Build UI for creating and managing campaigns
3. **Contact Import**: Add bulk contact import with duplicate detection
4. **Analytics**: Track delivery rates and engagement metrics
5. **Advanced Filtering**: Add more sophisticated suppression rules

This system provides a solid foundation for safe, scalable email campaigns with enterprise-grade deliverability protection. 