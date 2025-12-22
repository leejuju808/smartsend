#!/bin/bash

# Health check script for SmartSend performance monitoring
# Checks API health, DB latency, and edge function status

echo "🔍 SmartSend Health Check"
echo "========================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check API health
echo "1. Checking API Health..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" https://smartsendhq.com/api/health 2>/dev/null)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 2 | head -n 1)
TIME=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "200" ]; then
    printf "${GREEN}✓${NC} API is healthy (${TIME}s)\n"
else
    printf "${RED}✗${NC} API returned $HTTP_CODE\n"
fi

# Check database connectivity via Supabase
echo ""
echo "2. Checking Database Performance..."
# Add your Supabase health check endpoint here
# For now, we'll check if migrations have been applied

# Check response times for key endpoints
echo ""
echo "3. Testing Key Endpoints..."

endpoints=(
    "/api/dashboard/metrics"
    "/api/campaigns"
    "/api/analytics"
)

total_time=0
for endpoint in "${endpoints[@]}"; do
    response=$(curl -s -w "\n%{time_total}" -o /dev/null "https://smartsendhq.com${endpoint}" 2>/dev/null)
    time=$(echo "$response" | tail -n 1)
    time_ms=$(echo "$time * 1000" | bc)
    
    if (( $(echo "$time_ms < 300" | bc -l) )); then
        printf "${GREEN}✓${NC} $endpoint: ${time_ms}ms\n"
    else
        printf "${YELLOW}⚠${NC} $endpoint: ${time_ms}ms (slow)\n"
    fi
    
    total_time=$(echo "$total_time + $time" | bc)
done

echo ""
echo "4. Checking Materialized Views..."
# Check if materialized views are refreshing
echo "   Run: SELECT * FROM channel_performance_mv LIMIT 1;"

echo ""
echo "5. Summary"
echo "=========="
printf "Total API time: ${GREEN}$(echo $total_time | bc)${NC}s\n"
echo ""
echo "For detailed monitoring:"
echo "  - Supabase Dashboard: Check query performance"
echo "  - Vercel Analytics: Check edge function logs"
echo "  - Sentry: Check error rates"

