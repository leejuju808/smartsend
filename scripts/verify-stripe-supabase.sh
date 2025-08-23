#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
PORT="${PORT:-3000}"
WEBHOOK_PATH="/api/webhook"
ENV_FILE=".env.local"
NEXT_LOG="/tmp/next-dev.log"
STRIPE_LOG="/tmp/stripe-listen.log"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "✅ %s\n" "$*"; }
warn() { printf "⚠️  %s\n" "$*"; }
err()  { printf "❌ %s\n" "$*" >&2; }

# 0) Basic checks
bold "Step 0: Checking prerequisites"
command -v stripe >/dev/null || { err "Stripe CLI not found. Install: brew install stripe/stripe-cli/stripe"; exit 1; }
command -v node >/dev/null   || { err "Node not found. Install Node 18/20+."; exit 1; }
command -v npm  >/dev/null   || { err "npm not found."; exit 1; }

# 1) Verify required env vars exist (don't validate values)
bold "Step 1: Verifying required env vars in $ENV_FILE"
touch "$ENV_FILE"
required_vars=(
  "STRIPE_SECRET_KEY"
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)
for v in "${required_vars[@]}"; do
  if ! grep -qE "^${v}=" "$ENV_FILE"; then
    warn "$v is missing in $ENV_FILE (add it if you haven't)."
  else
    ok "$v found."
  fi
done

# 2) Start a fresh Stripe listener, capture whsec, and set STRIPE_WEBHOOK_SECRET
bold "Step 2: Starting Stripe listener and updating STRIPE_WEBHOOK_SECRET"
# Kill any previous listener
if pgrep -f "stripe listen --forward-to localhost:${PORT}${WEBHOOK_PATH}" >/dev/null; then
  warn "Killing previous stripe listen"
  pkill -f "stripe listen --forward-to localhost:${PORT}${WEBHOOK_PATH}" || true
fi

# Get a fresh signing secret (prints only the secret)
WHSEC="$(stripe listen --forward-to "localhost:${PORT}${WEBHOOK_PATH}" --print-secret 2> "$STRIPE_LOG" | tail -n1)"
if [[ ! "$WHSEC" =~ ^whsec_ ]]; then
  err "Failed to obtain whsec. Check $STRIPE_LOG for details."; exit 1
fi
ok "Got Stripe signing secret: $WHSEC"

# Replace or insert STRIPE_WEBHOOK_SECRET in .env.local
if grep -q "^STRIPE_WEBHOOK_SECRET=" "$ENV_FILE"; then
  sed -i.bak "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=${WHSEC}|" "$ENV_FILE"
else
  echo "STRIPE_WEBHOOK_SECRET=${WHSEC}" >> "$ENV_FILE"
fi
ok "Updated STRIPE_WEBHOOK_SECRET in $ENV_FILE"

# Also run a visible listener for logs
# (separate background process streaming events to $STRIPE_LOG)
nohup stripe listen --forward-to "localhost:${PORT}${WEBHOOK_PATH}" > "$STRIPE_LOG" 2>&1 & disown
ok "Stripe listener running. Log: $STRIPE_LOG"

# 3) Restart Next.js dev cleanly
bold "Step 3: Restarting Next dev"
if lsof -ti :"$PORT" >/dev/null; then
  warn "Port $PORT busy. Killing process on $PORT."
  lsof -ti :"$PORT" | xargs kill -9 || true
fi
# Kill any previous npm dev
pkill -f "npm run dev" || true

# Start dev
nohup npm run dev > "$NEXT_LOG" 2>&1 & disown
sleep 2
ok "Dev starting on http://localhost:${PORT}. Logs: $NEXT_LOG"

# 4) Guide user to test checkout + auto-tail logs for key events
bold "Step 4: Do a TEST checkout with 4242 card"
cat <<EOF
Open your browser to:
  http://localhost:${PORT}/dashboard/billing
Click Upgrade and pay with test card:
  4242 4242 4242 4242 (any future exp, any CVC/ZIP)
We are waiting to see these events in the Stripe log:
  - checkout.session.completed
  - customer.subscription.created
  - invoice.payment_succeeded
EOF

bold "Streaming Stripe listener (Ctrl+C to stop this tail, script will continue):"
# Tail in background for 3 key events; exit once all are seen
( 
  set +e
  need1=1; need2=1; need3=1
  tail -n +1 -f "$STRIPE_LOG" | while read -r line; do
    echo "$line"
    [[ $need1 -eq 1 && "$line" == *"checkout.session.completed"* ]] && { ok "Saw checkout.session.completed"; need1=0; }
    [[ $need2 -eq 1 && "$line" == *"customer.subscription.created"* ]] && { ok "Saw customer.subscription.created"; need2=0; }
    [[ $need2 -eq 1 && "$line" == *"customer.subscription.created"* ]] && { ok "Saw customer.subscription.created"; need2=0; }
    if [[ $need1 -eq 0 && $need2 -eq 0 && $need3 -eq 0 ]]; then
      ok "All expected events observed."
      pkill -P $$ tail || true
      break
    fi
  done
) || true

bold "Step 5: Verify Supabase subscription_status via SQL"
cat <<'EOSQL'

Run these in Supabase SQL editor (or your psql) and paste results:

-- Profiles table (if your app stores auth info here)
select id, email, subscription_status, updated_at
from public.profiles
order by updated_at desc
limit 5;

-- If you also mirror to public.users:
select id, email, subscription_status, updated_at
from public.users
order by updated_at desc
limit 5;

Expected: the user who just paid should show subscription_status = 'pro'.

EOSQL

bold "If anything failed, collect this template:"
cat <<'EOT'

--- Paste this template back to Ace ---
stripe listen line: stripe listen --forward-to localhost:3000/api/webhook
forwarding log (first 3 lines): <paste first 3 lines from /tmp/stripe-listen.log>
events:
1) <event #1>
2) <event #2>
3) <event #3>
Supabase SQL result:
id: <...>
email: <...>
subscription_status: <...>
updated_at: <...>
Debug:
lsof -i :3000:
<output>
node -v:
<output>
npm -v:
<output>
tail -n 40 /tmp/next-dev.log:
<output>
tail -n 60 /tmp/stripe-listen.log:
<output>
--- end template ---
EOT

ok "Verifier finished. If you saw the three Stripe events and Supabase shows 'pro', you're good!"
