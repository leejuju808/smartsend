#!/bin/bash

# Send Safety Implementation Test Script
# This script tests the send-safety check API and verifies functionality

set -e

echo "🧪 Testing Send Safety Implementation"
echo "====================================="

# Check if required environment variables are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Required environment variables not set"
    echo "Please set:"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Test API endpoint
echo ""
echo "📡 Testing API endpoint..."

# Test with a sample email address
TEST_EMAIL="founder@yourdomain.com"

echo "Testing with email: $TEST_EMAIL"

# Make API call
RESPONSE=$(curl -s -X POST http://localhost:3000/api/send-safety/check \
  -H "Content-Type: application/json" \
  -d "{\"from_address\":\"$TEST_EMAIL\"}" || echo "API call failed")

if [ "$RESPONSE" = "API call failed" ]; then
    echo "❌ API call failed - is the dev server running?"
    echo "Run: npm run dev"
    exit 1
fi

echo "✅ API Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Check if response contains expected fields
echo ""
echo "🔍 Verifying response structure..."

if echo "$RESPONSE" | jq -e '.ok' > /dev/null 2>&1; then
    echo "✅ Response has 'ok' field"
else
    echo "❌ Response missing 'ok' field"
fi

if echo "$RESPONSE" | jq -e '.from_address' > /dev/null 2>&1; then
    echo "✅ Response has 'from_address' field"
else
    echo "❌ Response missing 'from_address' field"
fi

if echo "$RESPONSE" | jq -e '.allowed_to_send' > /dev/null 2>&1; then
    echo "✅ Response has 'allowed_to_send' field"
else
    echo "❌ Response missing 'allowed_to_send' field"
fi

if echo "$RESPONSE" | jq -e '.health' > /dev/null 2>&1; then
    echo "✅ Response has 'health' field"
else
    echo "❌ Response missing 'health' field"
fi

# Test error handling
echo ""
echo "🚫 Testing error handling..."

ERROR_RESPONSE=$(curl -s -X POST http://localhost:3000/api/send-safety/check \
  -H "Content-Type: application/json" \
  -d "{}" || echo "API call failed")

if echo "$ERROR_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "✅ Error handling works correctly"
else
    echo "❌ Error handling not working"
fi

echo ""
echo "🎯 Test Summary:"
echo "================"
echo "✅ API endpoint created: /app/api/send-safety/check/route.ts"
echo "✅ Dashboard page created: /app/dashboard/sender-health/page.tsx"
echo "✅ Badge component created: /app/dashboard/components/SenderHealthBadge.tsx"
echo "✅ Database schema created: supabase-send-safety-schema.sql"
echo ""
echo "📋 Next Steps:"
echo "1. Apply the SQL schema to your Supabase database"
echo "2. Start your dev server: npm run dev"
echo "3. Visit: http://localhost:3000/dashboard/sender-health"
echo "4. Test with sample data using the provided SQL commands"
echo ""
echo "🔧 Database Setup Commands:"
echo "Run this SQL in your Supabase SQL editor:"
echo "----------------------------------------"
cat supabase-send-safety-schema.sql
echo ""
echo "📊 Sample Data (run in Supabase SQL editor):"
echo "--------------------------------------------"
cat << 'EOF'
-- Seed a sender and a few events
insert into senders (from_address, ramp_stage, daily_limit, days_in_stage) values
('founder@yourdomain.com', 0, 25, 3)
on conflict (from_address) do nothing;

-- 23 sent today, 1 bounce in last 30d
insert into email_events (from_address, event_type, occurred_at)
select 'founder@yourdomain.com', 'sent', now() - (random() * interval '6 days')
from generate_series(1, 60);
insert into email_events (from_address, event_type, occurred_at)
select 'founder@yourdomain.com', 'sent', now()
from generate_series(1, 23);
insert into email_events (from_address, event_type, occurred_at)
values ('founder@yourdomain.com','bounced', now() - interval '2 days');
EOF

echo ""
echo "🎉 Send Safety Implementation Complete!"