#!/usr/bin/env bash
set -euo pipefail

POST_URL="http://localhost:3000/api/webhooks/reply"
SECRET="${REPLY_WEBHOOK_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "REPLY_WEBHOOK_SECRET not set in env" 1>&2
  exit 1
fi

curl -sS -X POST "$POST_URL" \
  -H "x-webhook-secret: $SECRET" \
  -H 'content-type: application/json' \
  -d '{
    "campaign_id": "REPLACE-CAMPAIGN-UUID",
    "lead_id": "REPLACE-LEAD-UUID",
    "subject": "Re: Quick question",
    "text": "Hey Julian — yes let us chat tomorrow at 2pm.",
    "from_email": "ceo@acme.com"
  }' | jq

#!/usr/bin/env bash
set -euo pipefail

POST_URL="http://localhost:3000/api/webhooks/reply"
SECRET="${REPLY_WEBHOOK_SECRET}"

curl -sS -X POST "$POST_URL" \
  -H "x-webhook-secret: $SECRET" \
  -H 'content-type: application/json' \
  -d '{
    "campaign_id": "REPLACE-CAMPAIGN-UUID",
    "lead_id": "REPLACE-LEAD-UUID",
    "subject": "Re: Quick question",
    "text": "Hey Julian — yes let us chat tomorrow at 2pm.",
    "from_email": "ceo@acme.com"
  }' | jq
