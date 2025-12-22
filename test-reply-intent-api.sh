#!/bin/bash

# Test script for reply-intent API endpoint
# Make sure to set up your .env.local with the required environment variables

echo "Testing Reply Intent API..."

# Test with positive intent
echo "1. Testing positive intent..."
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{"replyText":"Yes lets meet tomorrow","recipientEmail":"lead@example.com","senderEmail":"you@smartsend.ai"}' \
  | jq '.'

echo -e "\n2. Testing neutral intent..."
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{"replyText":"Thanks for reaching out","recipientEmail":"lead@example.com","senderEmail":"you@smartsend.ai"}' \
  | jq '.'

echo -e "\n3. Testing negative intent..."
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{"replyText":"Not interested at this time","recipientEmail":"lead@example.com","senderEmail":"you@smartsend.ai"}' \
  | jq '.'

echo -e "\nTest completed!"