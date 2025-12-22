#!/bin/bash

# Test script for Gmail Webhook
# Usage: ./test-gmail-webhook.sh

set -e

# Configuration
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3000/api/gmail/webhook}"
TOKEN="${PUBSUB_WEBHOOK_TOKEN:-your-webhook-token}"
EMAIL="${TEST_EMAIL:-test@sender.com}"

echo "🧪 Testing Gmail Webhook"
echo "========================"
echo "URL: $WEBHOOK_URL"
echo "Email: $EMAIL"
echo ""

# Generate base64 encoded watch data
WATCH_DATA='{"emailAddress":"'$EMAIL'","historyId":"12345"}'
ENCODED_DATA=$(echo -n "$WATCH_DATA" | base64)

echo "📦 Watch data (encoded): $ENCODED_DATA"
echo ""

# Test 1: Valid request without token (should fail)
echo "Test 1: Request without token (expect 401)"
curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "data": "'$ENCODED_DATA'"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s || true

echo ""
echo "---"
echo ""

# Test 2: Valid request with token
echo "Test 2: Valid request with token"
curl -X POST "$WEBHOOK_URL?token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "data": "'$ENCODED_DATA'"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s || true

echo ""
echo "---"
echo ""

# Test 3: Request with token in header
echo "Test 3: Valid request with token in header"
curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -H "x-pubsub-token: $TOKEN" \
  -d '{
    "message": {
      "data": "'$ENCODED_DATA'"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s || true

echo ""
echo "---"
echo ""

# Test 4: Empty payload
echo "Test 4: Empty payload (expect noop)"
curl -X POST "$WEBHOOK_URL?token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s || true

echo ""
echo "---"
echo ""

# Test 5: Invalid base64 data
echo "Test 5: Invalid base64 data (expect noop)"
curl -X POST "$WEBHOOK_URL?token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "data": "invalid-base64!!!"
    }
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s || true

echo ""
echo ""
echo "✅ Tests completed"
echo ""
echo "📊 Expected behaviors:"
echo "  - Tests without token: 401 Unauthorized"
echo "  - Tests with valid token: 200 OK (or noop if no linked account)"
echo "  - Empty/invalid data: 200 OK with 'noop' note"
echo ""
echo "💡 Prerequisites for successful processing:"
echo "  - Gmail account linked in email_accounts table"
echo "  - Valid access_token (will auto-refresh)"
echo "  - Lead exists in leads table matching sender email"
echo "" 