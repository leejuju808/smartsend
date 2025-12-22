#!/bin/bash

# Test script for Custom Domain + DKIM Setup
# Usage: ./test-custom-domain.sh <workspace-id> <hostname>

BASE_URL="http://localhost:3000"
# For production: BASE_URL="https://app.smartsend.ai"

WORKSPACE_ID="${1:-your-workspace-id}"
HOSTNAME="${2:-test.example.com}"

echo "🧪 Testing Custom Domain Setup for SmartSend AI"
echo "================================================"
echo "Workspace ID: $WORKSPACE_ID"
echo "Hostname: $HOSTNAME"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Create domain
echo "📝 Step 1: Creating domain..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/domains/create" \
  -H "Content-Type: application/json" \
  -d "{\"workspace_id\": \"$WORKSPACE_ID\", \"hostname\": \"$HOSTNAME\"}")

DOMAIN_ID=$(echo $RESPONSE | jq -r '.domain_id // empty')

if [ -z "$DOMAIN_ID" ] || [ "$DOMAIN_ID" = "null" ]; then
  echo -e "${RED}✗ Failed to create domain${NC}"
  echo $RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✓ Domain created: $DOMAIN_ID${NC}"
echo ""

# Step 2: Get DNS records
echo "📋 Step 2: Fetching DNS records..."
RECORDS_RESPONSE=$(curl -s "$BASE_URL/api/domains/$DOMAIN_ID/records")
RECORDS=$(echo $RECORDS_RESPONSE | jq -r '.records')

if [ -z "$RECORDS" ] || [ "$RECORDS" = "null" ]; then
  echo -e "${RED}✗ Failed to fetch records${NC}"
  echo $RECORDS_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✓ Retrieved DNS records${NC}"
echo ""

echo "📋 DNS Records to Add:"
echo "-----------------------------------"
echo $RECORDS_RESPONSE | jq -r '.records[] | "\(.type) | \(.host) | \(.value)"' | while IFS='|' read type host value; do
  echo -e "${YELLOW}Type:${NC} $type"
  echo -e "${YELLOW}Host:${NC} $host"
  echo -e "${YELLOW}Value:${NC} $value"
  echo "---"
done

echo ""
echo "⚠️  Add these DNS records to your DNS provider, then run:"
echo -e "${YELLOW}./test-custom-domain.sh $WORKSPACE_ID $HOSTNAME verify${NC}"
echo ""

# Step 3: Verify (optional, if "verify" arg passed)
if [ "$3" = "verify" ]; then
  echo "🔍 Step 3: Verifying DNS records..."
  sleep 2
  
  VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/domains/$DOMAIN_ID/verify")
  IS_VERIFIED=$(echo $VERIFY_RESPONSE | jq -r '.ok // false')
  
  if [ "$IS_VERIFIED" = "true" ]; then
    echo -e "${GREEN}✓ All DNS records verified successfully!${NC}"
    
    # Get updated status
    FINAL_STATUS=$(curl -s "$BASE_URL/api/domains/$DOMAIN_ID/records" | jq -r '.domain.status')
    echo -e "${GREEN}Domain status: $FINAL_STATUS${NC}"
  else
    echo -e "${RED}✗ Some DNS records are not yet verified${NC}"
    echo $VERIFY_RESPONSE | jq '.'
    
    # Show which records are still pending
    PENDING_RECORDS=$(curl -s "$BASE_URL/api/domains/$DOMAIN_ID/records" | jq -r '.records[] | select(.verified == false) | "\(.type) at \(.host)"')
    if [ -n "$PENDING_RECORDS" ]; then
      echo ""
      echo "Pending records:"
      echo "$PENDING_RECORDS"
    fi
  fi
fi

echo ""
echo "✨ Test complete!"
echo ""
echo "Next steps:"
echo "1. Add the DNS records shown above to your DNS provider"
echo "2. Wait 15-30 minutes for DNS propagation"
echo "3. Run this script again with 'verify' argument to check status"
echo ""
echo "View UI at: $BASE_URL/dashboard/domains?ws=$WORKSPACE_ID&domain_id=$DOMAIN_ID" 