#!/bin/bash
# Test WhatsApp webhook endpoint

HOST="${1:-http://localhost:3000}"

echo "Testing WhatsApp webhook at $HOST/api/whatsapp/webhook"
echo ""

# Test GET (verification challenge)
echo "1. Testing GET (verification challenge)..."
curl -X GET "$HOST/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=dev-verify-token&hub.challenge=test_challenge_123"
echo ""
echo ""

# Test GET with wrong token
echo "2. Testing GET with wrong token (should fail)..."
curl -X GET "$HOST/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test_challenge_123"
echo ""
echo ""

# Test POST (inbound message)
echo "3. Testing POST (inbound message from WhatsApp Cloud API format)..."
curl -X POST "$HOST/api/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "+12065550123",
            "text": {
              "body": "Hello from WhatsApp!"
            }
          }]
        }
      }]
    }]
  }'
echo ""
echo ""

# Test POST (generic format)
echo "4. Testing POST (generic format)..."
curl -X POST "$HOST/api/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+12065550124",
    "text": "Hey OpsGrid! This is a test message."
  }'
echo ""
echo ""

echo "Done! Check your Supabase console for the contacts and messages tables."
