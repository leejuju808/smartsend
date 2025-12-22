#!/bin/bash
# Test script for inbox reply webhook
# Usage: ./test-inbox-webhook.sh [base_url]
# Example: ./test-inbox-webhook.sh http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 Testing Inbox Reply Webhook"
echo "Target: $BASE_URL/api/inbox/replies"
echo ""

# Test 1: Positive reply (should trigger MEETING_INTENT)
echo "📧 Test 1: Positive reply (meeting intent)"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/inbox/replies" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "prospect@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Re: Your cold email",
    "text": "Hey, I'\''m interested! Can we talk this week?",
    "provider": "resend",
    "sent_at_iso": "2025-10-16T19:05:00.000Z",
    "signature": "",
    "raw": {"test": "positive_reply"}
  }')

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""
echo ""

# Test 2: Negative reply (should return NO_INTENT)
echo "📧 Test 2: Negative reply (no intent)"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/inbox/replies" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "prospect2@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Re: Your cold email",
    "text": "Not interested, please remove me from your list.",
    "provider": "mailgun",
    "sent_at_iso": "2025-10-16T19:10:00.000Z",
    "signature": "",
    "raw": {"test": "negative_reply"}
  }')

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""
echo ""

# Test 3: Neutral/OOO reply
echo "📧 Test 3: Out of office reply"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/inbox/replies" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "prospect3@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Out of Office: Re: Your cold email",
    "text": "I am currently out of office and will return on October 20th.",
    "provider": "sendgrid",
    "sent_at_iso": "2025-10-16T19:15:00.000Z",
    "signature": "",
    "raw": {"test": "ooo_reply"}
  }')

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""
echo ""

# Test 4: Invalid signature (should return 401)
echo "🔒 Test 4: Invalid signature (should fail)"
echo "----------------------------------------"
# This test requires PROVIDER_WEBHOOK_SECRET to be set in env
RESPONSE=$(curl -s -w "\nHTTP Status: %{http_code}" -X POST "$BASE_URL/api/inbox/replies" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "attacker@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Malicious",
    "text": "Testing security",
    "provider": "unknown",
    "signature": "invalid_signature_here"
  }')

echo "$RESPONSE"
echo ""
echo ""

echo "✅ Tests complete!"
echo ""
echo "📊 Next steps:"
echo "  1. Check Supabase messages table for new rows"
echo "  2. Verify intent classification in reply_intent column"
echo "  3. Check meetings table for auto-created meetings (Test 1)"
echo ""
echo "SQL queries to run in Supabase:"
echo "  SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;"
echo "  SELECT * FROM meetings ORDER BY detected_at DESC LIMIT 5;"
