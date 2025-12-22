#!/bin/bash

# Analytics Implementation Verification Script

echo "🔍 Verifying Analytics Implementation..."

# Check if files exist
echo "📁 Checking files..."
if [ -f "src/app/api/analytics/route.ts" ]; then
    echo "✅ Analytics API route exists"
else
    echo "❌ Analytics API route missing"
    exit 1
fi

if [ -f "src/app/dashboard/analytics/page.tsx" ]; then
    echo "✅ Analytics dashboard page exists"
else
    echo "❌ Analytics dashboard page missing"
    exit 1
fi

if [ -f "supabase/migrations/20250133_analytics_schema_updates.sql" ]; then
    echo "✅ SQL migration file exists"
else
    echo "❌ SQL migration file missing"
    exit 1
fi

# Check TypeScript compilation
echo "🔧 Checking TypeScript compilation..."
npx tsc --noEmit --skipLibCheck src/app/api/analytics/route.ts
if [ $? -eq 0 ]; then
    echo "✅ Analytics API compiles successfully"
else
    echo "❌ Analytics API has compilation errors"
    exit 1
fi

npx tsc --noEmit --skipLibCheck src/app/dashboard/analytics/page.tsx
if [ $? -eq 0 ]; then
    echo "✅ Analytics dashboard compiles successfully"
else
    echo "❌ Analytics dashboard has compilation errors"
    exit 1
fi

echo ""
echo "🎉 Analytics implementation verification complete!"
echo ""
echo "📋 Next steps:"
echo "1. Apply the SQL migration: supabase/migrations/20250133_analytics_schema_updates.sql"
echo "2. Start the development server: npm run dev"
echo "3. Visit: http://localhost:3000/dashboard/analytics"
echo "4. Test the 7d/30d/90d time range toggles"
echo ""
echo "🔧 Features implemented:"
echo "• MB/100 (Meetings per 100 replies) calculation"
echo "• Reply→Meeting % conversion rate"
echo "• Reply Rate (replies / outbound sent)"
echo "• Daily time series chart for replies vs meetings"
echo "• Sender health distribution (green/yellow/red)"
echo "• Average 30-day bounce rate"
echo "• Total senders count"