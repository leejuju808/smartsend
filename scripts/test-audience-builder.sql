-- Test script for Audience Builder database setup
-- Run this in Supabase SQL editor to verify everything works

-- 1. Check if contacts table has the new domain column
SELECT 
  column_name, 
  data_type, 
  is_generated, 
  generation_expression
FROM information_schema.columns 
WHERE table_name = 'contacts' AND column_name = 'domain';

-- 2. Check if indexes were created
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE tablename = 'contacts' 
  AND indexname LIKE '%domain%' 
   OR indexname LIKE '%company%' 
   OR indexname LIKE '%created%';

-- 3. Check if segments table exists
SELECT 
  table_name, 
  table_type
FROM information_schema.tables 
WHERE table_name = 'segments';

-- 4. Check segments table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'segments'
ORDER BY ordinal_position;

-- 5. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'segments';

-- 6. Test domain extraction (if you have contacts data)
-- SELECT 
--   email,
--   domain
-- FROM contacts 
-- LIMIT 5;

-- 7. Test segments table insert (if you have auth.users)
-- INSERT INTO segments (user_id, name, definition) 
-- VALUES (
--   (SELECT id FROM auth.users LIMIT 1),
--   'Test Segment',
--   '{"q":"test","domains":["gmail.com"]}'::jsonb
-- );

-- 8. Verify the insert worked
-- SELECT * FROM segments; 