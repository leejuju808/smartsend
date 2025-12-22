#!/bin/bash

# Setup script for billing integration
echo "Setting up billing integration..."

# 1) Install Stripe SDK (try different package managers)
if command -v pnpm &> /dev/null; then
    echo "Installing Stripe SDK with pnpm..."
    pnpm add stripe
elif command -v npm &> /dev/null; then
    echo "Installing Stripe SDK with npm..."
    npm install stripe
elif command -v yarn &> /dev/null; then
    echo "Installing Stripe SDK with yarn..."
    yarn add stripe
else
    echo "No package manager found. Please install Stripe manually:"
    echo "npm install stripe"
fi

# 2) Create .env.local with placeholders
echo "Creating .env.local with placeholders..."
cat >> .env.local << 'EOF'
# Stripe Configuration (replace with your actual keys)
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_XXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_STRIPE_PRICE_ID=price_XXXXXXXXXXXXXXXX
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Run the SQL migration in Supabase: supabase/sql/2025-09-26_billing_gate.sql"
echo "2. Replace the placeholder Stripe keys in .env.local with your actual keys"
echo "3. Start your development server"
echo "4. Test the billing integration"