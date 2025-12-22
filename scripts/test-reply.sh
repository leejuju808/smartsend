#!/bin/bash

# SmartSend: Test Reply Detection Webhook
# 
# This script tests the inbound email webhook which forwards to the Edge Function
# for AI reply detection and auto-marking emails as replied.

set -e

# Default values
HOST="${HOST:-http://localhost:3000}"
ENDPOINT="${ENDPOINT:-/api/inbound/email}"

echo "🧪 Testing SmartSend Reply Detection"
echo "📍 Endpoint: ${HOST}${ENDPOINT}"
echo ""

# Test payload simulating a Gmail reply
PAYLOAD=$(cat <<EOF
{
  "provider": "gmail",
  "message_id": "<abc123@inbound>",
  "in_reply_to": "<our-sent-999@smartsend>",
  "thread_id": "17c3def999",
  "from": "jane@example.com",
  "to": ["you@smartsendhq.com"],
  "subject": "Re: Quick question",
  "text": "Thanks Julian, let's talk Monday at 10am."
}
EOF
)

echo "📤 Sending test reply payload..."
echo ""

# Make the request
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${HOST}${ENDPOINT}" \
  -H "content-type: application/json" \
  -d "$PAYLOAD")

# Extract status code and body
HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "📥 Response:"
echo "Status: ${HTTP_STATUS}"
echo ""
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test passed!"
else
  echo "❌ Test failed with status ${HTTP_STATUS}"
  exit 1
fi

