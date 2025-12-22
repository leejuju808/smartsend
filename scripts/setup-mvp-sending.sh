#!/bin/bash
# Setup script for MVP Sending Pipeline
# Run this after deploying the migration

set -e

echo "🚀 Setting up MVP Sending Pipeline..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Get project details
read -p "Enter your Supabase project reference ID: " PROJECT_REF
read -p "Enter your service role key: " SERVICE_ROLE_KEY
read -p "Enter your Google Client ID: " GOOGLE_CLIENT_ID
read -p "Enter your Google Client Secret: " GOOGLE_CLIENT_SECRET

echo ""
echo "📝 Deploying migration..."

# Deploy the migration
supabase db push --db-url "postgresql://postgres.${PROJECT_REF}:${SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  supabase/migrations/20250130000000_create_send_queue_mvp.sql

echo "✅ Migration deployed"

echo ""
echo "🔧 Deploying Edge Function..."

# Deploy the worker function
cd supabase
supabase functions deploy send-queue-worker \
  --project-ref $PROJECT_REF

echo "✅ Function deployed"

echo ""
echo "⚙️  Setting environment variables..."

# Set environment variables
supabase secrets set GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID --project-ref $PROJECT_REF
supabase secrets set GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET --project-ref $PROJECT_REF

echo "✅ Environment variables set"

echo ""
echo "📅 Setting up cron job..."

# Get function URL
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/send-queue-worker"

# Create cron job SQL
cat > /tmp/cron_setup.sql << EOF
-- Schedule send-queue-worker to run every minute
SELECT cron.schedule(
  'send-queue-worker',
  '* * * * *',
  \$\$
  SELECT net.http_post(
    url := '$FUNCTION_URL',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer $SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  \$\$
);
EOF

# Run the SQL
supabase db execute --file /tmp/cron_setup.sql --project-ref $PROJECT_REF

echo "✅ Cron job scheduled"

echo ""
echo "🎉 MVP Sending Pipeline is set up!"
echo ""
echo "Next steps:"
echo "1. Create a campaign in your app"
echo "2. POST to /api/campaigns/[id]/enqueue to start sending"
echo "3. Monitor logs in Supabase Dashboard → Edge Functions"
echo ""
echo "Documentation: docs/MVP_SENDING_PIPELINE.md" 