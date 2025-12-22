# Contacts & Suppressions v2 Implementation

## Overview

This document describes the enhanced contacts and suppressions system for SmartSendAI, designed to support $1M ARR through improved CSV import, deduplication, and suppression safety.

## Key Features

- **Email Normalization**: Automatic lowercase + trim for consistent deduplication
- **Row Level Security (RLS)**: Strict user isolation with `profile_id = auth.uid()`
- **Bulk Import Support**: Safe bulk insert function with automatic deduplication
- **Migration Path**: Seamless transition from existing system
- **Performance Optimized**: Proper indexing for fast lookups

## Database Schema

### Tables

#### `contacts_v2`
- `id`: UUID primary key
- `profile_id`: References `profiles(id)` with cascade delete
- `email`: Normalized email (lowercase + trimmed)
- `first_name`, `last_name`, `company`: Optional contact details
- `created_at`, `updated_at`: Timestamps

#### `suppressions_v2`
- `id`: UUID primary key
- `profile_id`: References `profiles(id)` with cascade delete
- `email`: Normalized email (lowercase + trimmed)
- `reason`: Suppression reason (e.g., "bounced", "unsubscribed", "complaint")
- `source`: Suppression source (e.g., "import", "manual", "system")
- `created_at`: Timestamp

### Constraints & Indexes

- **Unique**: `(profile_id, normalize_email(email))` per table
- **Fast Lookups**: Index on normalized email for deduplication checks
- **Data Integrity**: Check constraints prevent blank emails

## Functions

### `normalize_email(text)`
Normalizes email addresses by converting to lowercase and trimming whitespace.

```sql
select public.normalize_email('  TEST@Example.COM  ');
-- Returns: 'test@example.com'
```

### `bulk_insert_contacts_v2(profile_id, emails[], first_names[], last_names[], companies[])`
Safely bulk inserts contacts with automatic deduplication.

```sql
select * from public.bulk_insert_contacts_v2(
  'user-uuid-here',
  ARRAY['alice@example.com', 'bob@example.com'],
  ARRAY['Alice', 'Bob'],
  ARRAY['Smith', 'Jones'],
  ARRAY['Company A', 'Company B']
);
```

## Row Level Security (RLS)

All tables have strict RLS policies ensuring users can only access their own data:

- **Select**: `profile_id = auth.uid()`
- **Insert**: `profile_id = auth.uid()`
- **Update**: `profile_id = auth.uid()` (both USING and WITH CHECK)
- **Delete**: `profile_id = auth.uid()`

## Triggers

Automatic email normalization and timestamp updates on insert/update:

- `trg_contacts_v2_normalize`: Normalizes emails and sets `updated_at`
- `trg_suppressions_v2_normalize`: Normalizes emails

## Migration

### From Existing System

The migration automatically handles data transfer from the old system:

1. **Contacts**: Migrates from `contacts.user_id` to `contacts_v2.profile_id`
2. **Suppressions**: Migrates from `suppression_list.user_id` to `suppressions_v2.profile_id`
3. **Deduplication**: Prevents duplicate emails during migration
4. **Source Tracking**: Marks migrated suppressions with source = 'migrated'

### Migration Steps

1. **Apply Migration**: Run `20250152_create_contacts_suppressions_v2.sql`
2. **Verify**: Run `20250152_test_contacts_suppressions_v2.sql`
3. **Test**: Verify RLS isolation and data integrity
4. **Rollback if needed**: Use `20250152_rollback_contacts_suppressions_v2.sql`

## Usage Examples

### Adding a Single Contact

```sql
insert into public.contacts_v2 (profile_id, email, first_name, last_name, company)
values (auth.uid(), 'alice@example.com', 'Alice', 'Smith', 'Tech Corp');
```

### Adding a Suppression

```sql
insert into public.suppressions_v2 (profile_id, email, reason, source)
values (auth.uid(), 'bounce@example.com', 'bounced', 'system');
```

### Checking if Email is Suppressed

```sql
select exists(
  select 1 from public.suppressions_v2 
  where profile_id = auth.uid() 
  and public.normalize_email(email) = public.normalize_email('BOUNCE@EXAMPLE.COM')
);
```

### Bulk Import with Deduplication

```sql
-- This will only insert new, non-duplicate contacts
select * from public.bulk_insert_contacts_v2(
  auth.uid(),
  ARRAY['contact1@example.com', 'contact2@example.com'],
  ARRAY['John', 'Jane'],
  ARRAY['Doe', 'Smith']
);
```

## Testing RLS Isolation

Verify that users can only see their own data:

```sql
-- Simulate User A session
select set_config('request.jwt.claim.sub', 'user-a-uuid', true);

-- Insert data for User A
insert into public.contacts_v2 (profile_id, email) 
values ('user-a-uuid', 'alice@example.com');

-- Simulate User B session  
select set_config('request.jwt.claim.sub', 'user-b-uuid', true);

-- User B should see 0 rows from User A's data
select count(*) from public.contacts_v2; -- Should return 0
```

## Performance Considerations

- **Indexes**: Optimized for email lookups and profile-based queries
- **Normalization**: Email normalization happens at write time, not read time
- **Bulk Operations**: Use `bulk_insert_contacts_v2` for large imports
- **RLS**: Minimal overhead with proper indexing

## Security Features

- **User Isolation**: Complete data separation between users
- **Input Validation**: Email format and blank checks
- **SQL Injection Protection**: Parameterized functions
- **Audit Trail**: Timestamps for all operations

## Troubleshooting

### Common Issues

1. **RLS Blocking Operations**: Ensure `profile_id = auth.uid()`
2. **Duplicate Emails**: Check for case sensitivity or whitespace
3. **Migration Failures**: Verify existing data integrity

### Debug Queries

```sql
-- Check RLS policies
select * from pg_policies where tablename = 'contacts_v2';

-- Verify triggers
select * from information_schema.triggers 
where event_object_table = 'contacts_v2';

-- Test email normalization
select public.normalize_email('  TEST@Example.COM  ');
```

## Future Enhancements

- **Soft Deletes**: Add `deleted_at` column for audit trails
- **Bulk Suppression**: Function for bulk suppression operations
- **Email Validation**: Enhanced email format validation
- **Metrics**: Contact growth and suppression rate tracking

## Support

For issues or questions about this implementation:
1. Check the test file for verification steps
2. Review RLS policies and triggers
3. Verify data migration completed successfully
4. Test user isolation with multiple user sessions 