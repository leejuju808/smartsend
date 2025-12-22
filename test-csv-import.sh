#!/bin/bash

# Test script for CSV Contacts Import API

echo "🧪 Testing CSV Contacts Import API..."

# Test data
TEST_DATA='{
  "rows": [
    {
      "email": "test1@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company": "Test Corp",
      "title": "CEO",
      "phone": "555-1234"
    },
    {
      "email": "test2@example.com",
      "first_name": "Jane",
      "last_name": "Smith",
      "company": "Test Inc",
      "title": "CTO",
      "phone": "555-5678"
    },
    {
      "email": "invalid-email",
      "first_name": "Bad",
      "last_name": "Email",
      "company": "Nope",
      "title": "None",
      "phone": "555-9999"
    }
  ]
}'

echo "📊 Testing preview endpoint..."
PREVIEW_RESPONSE=$(curl -s -X POST http://localhost:3000/api/contacts/import/preview \
  -H "Content-Type: application/json" \
  -d "$TEST_DATA")

echo "Preview Response:"
echo "$PREVIEW_RESPONSE" | jq '.' 2>/dev/null || echo "$PREVIEW_RESPONSE"

echo ""
echo "✅ Test completed!"
echo ""
echo "To test the full flow:"
echo "1. Open http://localhost:3000/contacts/import"
echo "2. Drag test-contacts.csv onto the page"
echo "3. Click 'Preview De-dupe' to see statistics"
echo "4. Click 'Commit Import' to import contacts"