#!/bin/bash
# Test SmartSend MVP features

HOST="${1:-http://localhost:3000}"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-your_supabase_url}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-your_service_key}"

echo "SmartSend MVP Test Suite"
echo "========================"
echo ""

# Test 1: Check database tables exist
echo "1. Checking database schema..."
curl -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='"'"'leads'"'"')"
  }'
echo ""
echo ""

# Test 2: Import leads via API
echo "2. Testing CSV import..."
curl -X POST "$HOST/api/leads/import" \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"Email": "test@example.com", "First Name": "Test", "Last Name": "User"},
      {"Email": "demo@example.com", "Company": "Demo Corp"}
    ],
    "mapping": {
      "email": "Email",
      "first_name": "First Name",
      "last_name": "Last Name",
      "company": "Company"
    },
    "campaignId": "11111111-1111-1111-1111-111111111111",
    "userId": "00000000-0000-0000-0000-000000000000"
  }'
echo ""
echo ""

# Test 3: Test filters and pagination
echo "3. Testing dashboard filters..."
curl -X GET "$HOST/api/leads?status=failed&page=1&perPage=20"
echo ""
echo ""

# Test 4: Test reply detection webhook
echo "4. Testing reply detection..."
curl -X POST "$SUPABASE_URL/functions/v1/replyDetection" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "generic",
    "message_id": "test_msg_123",
    "subject": "Re: Your offer",
    "body_text": "Yes, I would like to learn more!",
    "from_email": "prospect@example.com"
  }'
echo ""
echo ""

echo "Done! Check the results above."
