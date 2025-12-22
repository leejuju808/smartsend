#!/bin/bash
# Test script for AI-powered reply intent detection
# Usage: ./test-reply-intent-ai.sh

echo "🧪 Testing Reply Intent API with AI Classification"
echo "=================================================="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:3000/api/reply-intent}"
MESSAGE_ID="${MESSAGE_ID:-$(uuidgen)}"

# Test 1: Interested Reply
echo "Test 1: Interested Reply"
echo "------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID\",
    \"replyText\": \"Sure, let's hop on a quick call! I'd love to discuss this further.\",
    \"senderEmail\": \"prospect@example.com\"
  }" | jq '.'

echo -e "\n\n"

# Test 2: Not Interested Reply
echo "Test 2: Not Interested Reply"
echo "-----------------------------"
MESSAGE_ID_2=$(uuidgen)
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID_2\",
    \"replyText\": \"Thanks, but I'm not interested at this time.\",
    \"senderEmail\": \"prospect2@example.com\"
  }" | jq '.'

echo -e "\n\n"

# Test 3: Neutral Reply
echo "Test 3: Neutral Reply"
echo "---------------------"
MESSAGE_ID_3=$(uuidgen)
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"$MESSAGE_ID_3\",
    \"replyText\": \"Thanks for reaching out.\",
    \"senderEmail\": \"prospect3@example.com\"
  }" | jq '.'

echo -e "\n\n"

# Test 4: Missing required fields
echo "Test 4: Validation - Missing Fields"
echo "-----------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"test-123\"
  }" | jq '.'

echo -e "\n\n"
echo "✅ Tests complete!"
