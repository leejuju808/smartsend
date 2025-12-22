#!/bin/bash

# Deploy sequence scheduler function and set up cron job
# Usage: ./scripts/deploy-sequence-scheduler.sh

set -e

echo "Deploying sequence scheduler function..."

# Deploy the function
supabase functions deploy sequence-scheduler

echo "Setting up cron job (runs every minute)..."

# Create cron job to run every minute
supabase functions schedule create sequence-scheduler --cron "* * * * *"

echo "✅ Sequence scheduler deployed and scheduled successfully!"
echo "The scheduler will run every minute to process due sequence enrollments."