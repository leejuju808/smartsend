#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testStripeIntegration() {
  console.log("🧪 Testing Stripe Integration...\n");

  try {
    // Test 1: Check if profiles table has Stripe columns
    console.log("1. Checking profiles table structure...");
    const { data: columns, error: columnsError } = await supabase
      .from("profiles")
      .select("*")
      .limit(1);

    if (columnsError) {
      console.error("❌ Error accessing profiles table:", columnsError.message);
      return;
    }

    if (columns && columns.length > 0) {
      const profile = columns[0] as any;
      const hasStripeCustomerId = 'stripe_customer_id' in profile;
      const hasStripeSubscriptionId = 'stripe_subscription_id' in profile;
      const hasSubscriptionStatus = 'subscription_status' in profile;
      const hasPeriodEnd = 'subscription_current_period_end' in profile;

      console.log(`   ✅ stripe_customer_id: ${hasStripeCustomerId ? 'EXISTS' : 'MISSING'}`);
      console.log(`   ✅ stripe_subscription_id: ${hasStripeSubscriptionId ? 'EXISTS' : 'MISSING'}`);
      console.log(`   ✅ subscription_status: ${hasSubscriptionStatus ? 'EXISTS' : 'MISSING'}`);
      console.log(`   ✅ subscription_current_period_end: ${hasPeriodEnd ? 'EXISTS' : 'MISSING'}`);
    }

    // Test 2: Check if webhook endpoint exists
    console.log("\n2. Testing webhook endpoint...");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      
      if (response.status === 400) {
        console.log("   ✅ Webhook endpoint exists (returned 400 for invalid signature - expected)");
      } else {
        console.log(`   ⚠️  Webhook endpoint responded with status: ${response.status}`);
      }
    } catch (error) {
      console.log("   ❌ Webhook endpoint not accessible:", (error as Error).message);
    }

    // Test 3: Check if billing portal endpoint exists
    console.log("\n3. Testing billing portal endpoint...");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/billing/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.status === 401) {
        console.log("   ✅ Billing portal endpoint exists (returned 401 for unauthenticated - expected)");
      } else {
        console.log(`   ⚠️  Billing portal endpoint responded with status: ${response.status}`);
      }
    } catch (error) {
      console.log("   ❌ Billing portal endpoint not accessible:", (error as Error).message);
    }

    // Test 4: Check environment variables
    console.log("\n4. Checking environment variables...");
    const requiredEnvVars = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_STRIPE_PRICE_ID'
    ];

    requiredEnvVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        console.log(`   ✅ ${varName}: ${value.substring(0, 10)}...`);
      } else {
        console.log(`   ❌ ${varName}: MISSING`);
      }
    });

    console.log("\n🎉 Stripe integration test completed!");
    console.log("\n📋 Next steps:");
    console.log("1. Run the database migration: supabase db push");
    console.log("2. Set up Stripe webhook: stripe listen --forward-to localhost:3000/api/webhooks/stripe");
    console.log("3. Test the upgrade flow: /dashboard/billing → Upgrade to Pro");
    console.log("4. Verify webhook processing in server logs");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testStripeIntegration(); 