#!/bin/bash
# Test script for Gmail push webhook

# Set your environment variables
WEBHOOK_URL="${GMAIL_PUSH_WEBHOOK_URL:-http://localhost:3000/api/gmail/push}"
WEBHOOK_SECRET="${GMAIL_WEBHOOK_SECRET:-test-secret-12345}"

echo "Testing Gmail Push Webhook"
echo "=========================="
echo ""

# Test 1: Direct JSON payload (simulating Zapier/cron/relay)
echo "Test 1: Direct JSON payload"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
    "workspace_id": "123e4567-e89b-12d3-a456-426614174000",
    "from_email": "customer@example.com",
    "subject": "Re: Quick question",
    "body": "Sure, lets talk Monday. I am interested in your product.",
    "provider_message_id": "18c7f0a2b1d3c9e7",
    "thread_id": "186fe7f3a9a8c2d1",
    "received_at": "2025-01-03T19:22:03Z"
  }'
echo -e "\n\n"

# Test 2: Pub/Sub push notification (base64 encoded)
echo "Test 2: Pub/Sub push notification"
PAYLOAD=$(echo '{
  "workspace_id": "123e4567-e89b-12d3-a456-426614174000",
  "from_email": "lead@prospect.com",
  "subject": "Interested in partnership",
  "body": "Hi, I would like to discuss a potential partnership opportunity.",
  "provider_message_id": "19d8g1b3c2e4f0a8",
  "thread_id": "197gf8f4b9b9c3e2",
  "lead_id": "789e0123-f45a-67b8-c901-234567890abc"
}' | base64)

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d "{
    \"message\": {
      \"data\": \"$PAYLOAD\",
      \"messageId\": \"123456789\"
    },
    \"subscription\": \"projects/myproject/subscriptions/mysubscription\"
  }"
echo -e "\n\n"

# Test 3: Missing webhook secret (should fail)
echo "Test 3: Missing webhook secret (should fail with 401)"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "123e4567-e89b-12d3-a456-426614174000",
    "from_email": "test@example.com",
    "subject": "Test",
    "body": "Test message"
  }'
echo -e "\n\n"

# Test 4: Lead not found (should store anyway)
echo "Test 4: Lead not found (should store anyway)"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
    "workspace_id": "unknown-workspace-id",
    "from_email": "unknown@example.com",
    "subject": "Unknown lead",
    "body": "This lead does not exist in the system yet"
  }'
echo -e "\n\n"

echo "Testing complete!" 