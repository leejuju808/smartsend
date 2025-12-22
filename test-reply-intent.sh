#!/bin/bash
# Test script for reply-intent-detector edge function

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
FUNCTION_URL="${SUPABASE_URL}/functions/v1/reply-intent-detector"
ANON_KEY="${SUPABASE_ANON_KEY}"

echo -e "${BLUE}Testing Reply-Intent Detector Edge Function${NC}\n"

# Test 1: Positive Meeting Intent
echo -e "${YELLOW}Test 1: Positive Meeting Intent${NC}"
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "messageId": "test-123",
    "sender": "eager-lead@example.com",
    "subject": "Re: Partnership Opportunity",
    "bodyText": "Sure, I would love to schedule a call this week! When works best for you?"
  }' | jq '.'

echo -e "\n"

# Test 2: Neutral Response
echo -e "${YELLOW}Test 2: Neutral Response${NC}"
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "messageId": "test-124",
    "sender": "maybe-later@company.com",
    "subject": "Re: Product Demo",
    "bodyText": "Thanks for reaching out. I will review this and get back to you next quarter."
  }' | jq '.'

echo -e "\n"

# Test 3: Negative Response
echo -e "${YELLOW}Test 3: Negative Response${NC}"
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "messageId": "test-125",
    "sender": "notinterested@example.com",
    "subject": "Re: Meeting Request",
    "bodyText": "Not interested. Please remove me from your mailing list."
  }' | jq '.'

echo -e "\n${GREEN}Testing complete!${NC}"
echo -e "Check your Supabase dashboard for created meetings and logged events."
