#!/bin/bash

# Test script for reply-intent API endpoint
# Usage: ./test-reply-intent.sh

echo "🧪 Testing Reply Intent API Endpoint"
echo "====================================="

# Test data
REPLY_TEXT="Yes, let's meet next week"
RECIPIENT_EMAIL="demo@example.com"
MESSAGE_ID="1234"

echo "📝 Test Data:"
echo "  Reply Text: $REPLY_TEXT"
echo "  Recipient Email: $RECIPIENT_EMAIL"
echo "  Message ID: $MESSAGE_ID"
echo ""

# Test the API endpoint
echo "🚀 Testing API endpoint..."
echo "POST http://localhost:3000/api/reply-intent"
echo ""

# Make the API call
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d "{
    \"reply_text\": \"$REPLY_TEXT\",
    \"recipient_email\": \"$RECIPIENT_EMAIL\",
    \"message_id\": \"$MESSAGE_ID\"
  }" \
  -w "\n\n📊 Response Time: %{time_total}s\n" \
  -s

echo ""
echo "✅ Test completed!"
echo ""
echo "Expected output should include:"
echo "  - booked: true"
echo "  - calendlyUrl: https://calendly.com/smartsend-ai/30min"
echo "  - ics: BEGIN:VCALENDAR..."