#!/bin/bash
# Test script for MB/100 Analytics API

echo "🧪 Testing MB/100 Analytics API"
echo "================================"
echo ""

# Configuration
BASE_URL="${1:-http://localhost:3000}"
PROFILE_ID="${2:-}"

echo "Base URL: $BASE_URL"
echo ""

# Test 1: Get all analytics (no profile filter)
echo "📊 Test 1: Get all analytics (last 14 days)"
echo "-------------------------------------------"
curl -s "${BASE_URL}/api/analytics?days=14" | jq '.' || echo "❌ Failed to fetch analytics"
echo ""
echo ""

# Test 2: Get analytics for specific profile (if provided)
if [ -n "$PROFILE_ID" ]; then
  echo "📊 Test 2: Get analytics for profile: $PROFILE_ID"
  echo "-------------------------------------------"
  curl -s "${BASE_URL}/api/analytics?profileId=${PROFILE_ID}&days=30" | jq '.' || echo "❌ Failed to fetch profile analytics"
  echo ""
  echo ""
fi

# Test 3: Get analytics with different day ranges
echo "📊 Test 3: Get analytics for last 7 days"
echo "-------------------------------------------"
curl -s "${BASE_URL}/api/analytics?days=7" | jq '.days, .data[0] | select(. != null)' || echo "❌ Failed to fetch 7-day analytics"
echo ""
echo ""

echo "📊 Test 4: Get analytics for last 90 days (max)"
echo "-------------------------------------------"
curl -s "${BASE_URL}/api/analytics?days=90" | jq '.days, .data[0] | select(. != null)' || echo "❌ Failed to fetch 90-day analytics"
echo ""
echo ""

# Test 5: Check response structure
echo "📊 Test 5: Validate response structure"
echo "-------------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/analytics?days=14")

if echo "$RESPONSE" | jq -e '.days' > /dev/null 2>&1; then
  echo "✅ Response has 'days' field"
else
  echo "❌ Response missing 'days' field"
fi

if echo "$RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
  echo "✅ Response has 'data' field"
else
  echo "❌ Response missing 'data' field"
fi

DATA_COUNT=$(echo "$RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo "📈 Found $DATA_COUNT profile(s) with analytics data"
echo ""

# Test 6: Extract key metrics
if [ "$DATA_COUNT" -gt "0" ]; then
  echo "📊 Test 6: Sample metrics from first profile"
  echo "-------------------------------------------"
  echo "$RESPONSE" | jq '.data[0] | {
    profile_id: .profile_id,
    mb_per_100: .totals.mb_per_100_30d,
    replies_30d: .totals.replies_30d,
    meetings_30d: .totals.meetings_30d,
    sender_health: .sender_health_score,
    daily_data_points: (.daily | length)
  }' || echo "❌ Failed to extract metrics"
fi

echo ""
echo "================================"
echo "✅ Analytics API tests complete!"
echo ""
echo "Usage:"
echo "  $0 [BASE_URL] [PROFILE_ID]"
echo ""
echo "Examples:"
echo "  $0"
echo "  $0 http://localhost:3000"
echo "  $0 http://localhost:3000 550e8400-e29b-41d4-a716-446655440000"
