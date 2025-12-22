-- Test file for contacts_suppressions_v2 migration
-- Run this after applying the main migration to verify everything works

-- Test 1: Verify tables exist
select 
  table_name,
  table_type
from information_schema.tables 
where table_schema = 'public' 
and table_name in ('contacts_v2', 'suppressions_v2')
order by table_name;

-- Test 2: Verify functions exist
select 
  routine_name,
  routine_type
from information_schema.routines 
where routine_schema = 'public' 
and routine_name in ('normalize_email', 'bulk_insert_contacts_v2')
order by routine_name;

-- Test 3: Verify RLS is enabled
select 
  schemaname,
  tablename,
  rowsecurity
from pg_tables 
where schemaname = 'public' 
and tablename in ('contacts_v2', 'suppressions_v2')
order by tablename;

-- Test 4: Verify policies exist
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies 
where schemaname = 'public' 
and tablename in ('contacts_v2', 'suppressions_v2')
order by tablename, policyname;

-- Test 5: Verify indexes exist
select 
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes 
where schemaname = 'public' 
and tablename in ('contacts_v2', 'suppressions_v2')
order by tablename, indexname;

-- Test 6: Verify triggers exist
select 
  trigger_schema,
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
from information_schema.triggers 
where trigger_schema = 'public' 
and event_object_table in ('contacts_v2', 'suppressions_v2')
order by event_object_table, trigger_name;

-- Test 7: Test email normalization function
select 
  'test@EXAMPLE.com' as input,
  public.normalize_email('test@EXAMPLE.com') as normalized,
  public.normalize_email('  TEST@example.COM  ') as normalized_trimmed,
  public.normalize_email(null) as null_input;

-- Test 8: Verify profile_id references profiles table
select 
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
from information_schema.key_column_usage kcu
join information_schema.referential_constraints rc 
  on kcu.constraint_name = rc.constraint_name
where kcu.table_schema = 'public' 
and kcu.table_name in ('contacts_v2', 'suppressions_v2')
and kcu.column_name = 'profile_id'
order by table_name; 