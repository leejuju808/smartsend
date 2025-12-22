#!/bin/bash

# Test script for bounce webhook implementation
# Run this after: npm run dev

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 Testing Bounce Webhook System"
echo "================================"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: SendGrid bounce
echo -e "${YELLOW}Test 1: SendGrid-style bounce${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/bounce" \
  -H "Content-Type: application/json" \
  -H "User-Agent: SendGrid/1.0" \
  -d '[
    {
      "email":"bounced@example.com",
      "event":"bounce",
      "reason":"550 5.1.1 user unknown",
      "sg_message_id":"abc123.transport",
      "smtp-id":"<abc123@mail.example.com>"
    }
  ]')

if echo "$RESPONSE" | jq -e '.success == true and .processed == 1' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SendGrid bounce processed successfully${NC}"
else
  echo -e "${RED}✗ SendGrid bounce failed${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 2: Mailgun bounce
echo -e "${YELLOW}Test 2: Mailgun-style bounce${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/bounce" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mailgun/1.0" \
  -d '{
    "signature": {"timestamp":"1234567890", "token":"test-token", "signature":"test-sig"},
    "event-data": {
      "event":"failed",
      "reason":"bounce",
      "recipient":"hardbounce@example.com",
      "delivery-status":{"message":"hard fail"},
      "message":{"headers":{"message-id":"<mg-123@domain>"}}
    }
  }')

if echo "$RESPONSE" | jq -e '.success == true and .processed == 1' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Mailgun bounce processed successfully${NC}"
else
  echo -e "${RED}✗ Mailgun bounce failed${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 3: SES bounce
echo -e "${YELLOW}Test 3: SES-style bounce${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/bounce" \
  -H "Content-Type: application/json" \
  -H "X-Amz-Sns-Message-Type: Notification" \
  -d '{
    "notificationType":"Bounce",
    "mail":{"messageId":"ses-123"},
    "bounce":{
      "bounceType":"Permanent",
      "bounceSubType":"General",
      "bouncedRecipients":[{"emailAddress":"sesbounce@example.com"}]
    }
  }')

if echo "$RESPONSE" | jq -e '.success == true and .processed == 1' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SES bounce processed successfully${NC}"
else
  echo -e "${RED}✗ SES bounce failed${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 4: SendGrid complaint/spam report
echo -e "${YELLOW}Test 4: SendGrid-style spam complaint${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/bounce" \
  -H "Content-Type: application/json" \
  -H "User-Agent: SendGrid/1.0" \
  -d '[
    {
      "email":"complainer@example.com",
      "event":"spamreport",
      "sg_message_id":"spam456.transport"
    }
  ]')

if echo "$RESPONSE" | jq -e '.success == true and .processed == 1' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SendGrid spam complaint processed successfully${NC}"
else
  echo -e "${RED}✗ SendGrid spam complaint failed${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 5: SES complaint
echo -e "${YELLOW}Test 5: SES-style complaint${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/bounce" \
  -H "Content-Type: application/json" \
  -H "X-Amz-Sns-Message-Type: Notification" \
  -d '{
    "notificationType":"Complaint",
    "mail":{"messageId":"ses-complaint-789"},
    "complaint":{
      "complainedRecipients":[{"emailAddress":"sesComplaint@example.com"}]
    }
  }')

if echo "$RESPONSE" | jq -e '.success == true and .processed == 1' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SES complaint processed successfully${NC}"
else
  echo -e "${RED}✗ SES complaint failed${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 6: Check suppressions list
echo -e "${YELLOW}Test 6: Check suppressions list${NC}"
RESPONSE=$(curl -s "$BASE_URL/api/suppressions/list")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  COUNT=$(echo "$RESPONSE" | jq '.items | length')
  echo -e "${GREEN}✓ Suppressions list retrieved: $COUNT items${NC}"
  echo "Recent suppressions:"
  echo "$RESPONSE" | jq -r '.items[0:5] | .[] | "  - \(.email): \(.reason)"'
else
  echo -e "${RED}✗ Failed to retrieve suppressions${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

# Test 7: Add manual suppression
echo -e "${YELLOW}Test 7: Add manual suppression${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/suppressions/add" \
  -H "Content-Type: application/json" \
  -d '{"email":"manual-suppress@example.com","reason":"manual test"}')

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Manual suppression added successfully${NC}"
else
  echo -e "${RED}✗ Failed to add manual suppression${NC}"
  echo "$RESPONSE" | jq .
fi
echo ""

echo "================================"
echo -e "${GREEN}✅ Bounce webhook testing complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Visit $BASE_URL/suppressions to see the UI"
echo "2. Check your database for webhook_events logs"
echo "3. If you have sender/campaign data, check for alerts"
