#!/bin/bash

# Test script for Auto-Calendar Insert endpoint
# Usage: ./scripts/test-reply-intent.sh

echo "🧪 Testing Reply Intent API Endpoint..."
echo ""

# Test 1: Meeting intent detected
echo "Test 1: Meeting intent (should send invite email)"
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_123",
    "senderEmail": "user@example.com",
    "subject": "Re: Intro",
    "body": "Thanks for reaching out! Can we schedule a quick call to discuss?",
    "leadEmail": "lead@example.com",
    "leadFirstName": "John"
  }' | jq '.'

echo ""
echo "---"
echo ""

# Test 2: No meeting intent
echo "Test 2: No meeting intent (should return neutral)"
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_124",
    "senderEmail": "user@example.com",
    "subject": "Re: Intro",
    "body": "Thanks for the info. I will review and get back to you.",
    "leadEmail": "lead@example.com",
    "leadFirstName": "Jane"
  }' | jq '.'

echo ""
echo "---"
echo ""

# Test 3: Idempotency check
echo "Test 3: Duplicate request (should skip sending)"
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_123",
    "senderEmail": "user@example.com",
    "subject": "Re: Intro",
    "body": "Can we schedule a call?",
    "leadEmail": "lead@example.com",
    "leadFirstName": "John"
  }' | jq '.'

echo ""
echo "✅ Tests completed!"
