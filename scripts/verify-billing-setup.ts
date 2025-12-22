#!/usr/bin/env tsx

/**
 * Verification script for the new billing components
 * Run with: npx tsx scripts/verify-billing-setup.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySetup() {
  console.log('🔍 Verifying billing setup...\n');

  // 1. Check if profiles table has required columns
  console.log('1. Checking profiles table schema...');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_status, workspace_id')
      .limit(1);
    
    if (error) {
      console.error('❌ Profiles table query failed:', error.message);
      return false;
    }
    console.log('✅ Profiles table accessible');
  } catch (err) {
    console.error('❌ Profiles table error:', err);
    return false;
  }

  // 2. Check environment variables
  console.log('\n2. Checking environment variables...');
  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_APP_URL'
  ];

  let envVarsOk = true;
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      console.error(`❌ Missing: ${varName}`);
      envVarsOk = false;
    } else {
      console.log(`✅ ${varName} is set`);
    }
  }

  if (!envVarsOk) {
    console.log('\n📝 Add missing variables to .env.local:');
    console.log('STRIPE_SECRET_KEY=sk_test_...');
    console.log('NEXT_PUBLIC_APP_URL=http://localhost:3000');
    return false;
  }

  // 3. Test Stripe connection
  console.log('\n3. Testing Stripe connection...');
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.prices.list({ limit: 1 });
    console.log('✅ Stripe connection successful');
  } catch (err: any) {
    console.error('❌ Stripe connection failed:', err.message);
    return false;
  }

  console.log('\n🎉 All checks passed! Your billing setup is ready.');
  console.log('\n📋 Next steps:');
  console.log('1. Start dev server: npm run dev');
  console.log('2. Visit /billing page');
  console.log('3. Enter a workspace ID to test the components');
  console.log('4. Check the navbar for the billing button');

  return true;
}

verifySetup().catch(console.error);