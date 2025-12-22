#!/bin/bash
# Test script for reply detection edge function

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing Reply Detection Edge Function${NC}"
echo ""

# Get environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
EDGE_URL="${SUPABASE_URL}/functions/v1/detectReply"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo -e "${RED}Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${NC}"
  exit 1
fi

echo -e "${GREEN}Endpoint:${NC} $EDGE_URL"
echo ""

# Test 1: Human Reply
echo -e "${YELLOW}Test 1: Human Reply${NC}"
RESPONSE=$(curl -s -X POST "$EDGE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{
    "subject": "Re: Interested in your product",
    "body": "Hi! I would love to learn more about this. Can we schedule a call?",
    "campaign_id": "00000000-0000-0000-0000-000000000000",
    "threadId": "test-thread-human-001",
    "from": "test@example.com"
  }')

echo "$RESPONSE" | jq '.'
echo ""

# Test 2: Out of Office
echo -e "${YELLOW}Test 2: Out of Office${NC}"
RESPONSE=$(curl -s -X POST "$EDGE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{
    "subject": "Out of Office: Auto Reply",
    "body": "Thank you for your email. I am currently out of the office until next week. I will respond to your message when I return.",
    "campaign_id": "00000000-0000-0000-0000-000000000000",
    "threadId": "test-thread-ooo-001",
    "from": "test@example.com"
  }')

echo "$RESPONSE" | jq '.'
echo ""

# Test 3: Automated System Message
echo -e "${YELLOW}Test 3: Automated System Message${NC}"
RESPONSE=$(curl -s -X POST "$EDGE_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{
    "subject": "Mail Delivery Failed",
    "body": "This is an automatically generated Delivery Status Notification. Your message could not be delivered.",
    "campaign_id": "00000000-0000-0000-0000-000000000000",
    "threadId": "test-thread-bounce-001",
    "from": "mailer-daemon@example.com"
  }')

echo "$RESPONSE" | jq '.'
echo ""

echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "Note: These tests use dummy campaign IDs and may fail on database lookups."
echo "For production testing, use real campaign_id and thread_id values."

