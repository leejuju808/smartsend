#!/bin/bash

# Test script for Replies Dashboard
echo "🧪 Testing Replies Dashboard Setup..."

# Check if required files exist
echo "📁 Checking file structure..."
files=(
  "src/app/dashboard/replies/page.tsx"
  "src/app/dashboard/replies/replies-actions.ts"
  "src/app/api/replies-feed/route.ts"
  "supabase/migrations/20250127_replies_dashboard_schema.sql"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ $file missing"
  fi
done

# Check if API endpoint exists
echo ""
echo "🔌 Checking API endpoints..."
if [ -d "src/app/api/reply-intent" ]; then
  echo "✅ /api/reply-intent exists"
else
  echo "❌ /api/reply-intent missing"
fi

if [ -d "src/app/api/replies-feed" ]; then
  echo "✅ /api/replies-feed exists"
else
  echo "❌ /api/replies-feed missing"
fi

echo ""
echo "📋 Next steps:"
echo "1. Apply the SQL migration: supabase/migrations/20250127_replies_dashboard_schema.sql"
echo "2. Start the dev server: npm run dev"
echo "3. Visit: http://localhost:3000/dashboard/replies"
echo "4. Seed test data (see SQL comments in migration file)"

echo ""
echo "🎯 Acceptance checklist:"
echo "[ ] Table loads latest replies with sender, subject, snippet, timestamp"
echo "[ ] 'Book (AI)' creates a meeting row and shows Calendly link if returned"
echo "[ ] 'Mark Booked' inserts a meeting row without Calendly link"
echo "[ ] Status chip turns to '✅ Booked'"