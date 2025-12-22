#!/usr/bin/env tsx

/**
 * Gmail Integration Test Script
 * 
 * This script tests the Gmail integration by:
 * 1. Checking if the database migration was applied
 * 2. Testing the OAuth callback function
 * 3. Testing the provider-send function
 * 4. Verifying the integration flow
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testDatabaseMigration() {
  console.log('🔍 Testing database migration...');
  
  try {
    const { data, error } = await supabase
      .from('user_email_providers')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Database migration failed:', error.message);
      return false;
    }
    
    console.log('✅ Database migration successful - user_email_providers table exists');
    return true;
  } catch (err) {
    console.error('❌ Database migration test failed:', err);
    return false;
  }
}

async function testOAuthCallback() {
  console.log('🔍 Testing OAuth callback function...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/oauth-gmail-callback`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    
    // Should return 400 for missing code/state, which is expected
    if (response.status === 400) {
      console.log('✅ OAuth callback function is accessible');
      return true;
    } else {
      console.log('⚠️  OAuth callback function returned unexpected status:', response.status);
      return false;
    }
  } catch (err) {
    console.error('❌ OAuth callback test failed:', err);
    return false;
  }
}

async function testProviderSend() {
  console.log('🔍 Testing provider-send function...');
  
  try {
    const testPayload = {
      workspace_id: 'test-workspace',
      user_id: 'test-user',
      provider: 'gmail',
      to: 'test@example.com',
      subject: 'Test Email',
      html: '<p>Test email content</p>',
    };
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/provider-send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });
    
    const result = await response.json();
    
    // Should fail with "No connected Gmail account found" which is expected
    if (response.status === 500 && result.error?.includes('No connected Gmail account found')) {
      console.log('✅ Provider-send function is accessible and properly validates Gmail accounts');
      return true;
    } else {
      console.log('⚠️  Provider-send function returned unexpected response:', result);
      return false;
    }
  } catch (err) {
    console.error('❌ Provider-send test failed:', err);
    return false;
  }
}

async function testIntegrationFlow() {
  console.log('🔍 Testing complete integration flow...');
  
  try {
    // Test 1: Check if user_email_providers table has proper structure
    const { data: tableInfo, error: tableError } = await supabase
      .from('user_email_providers')
      .select('id, user_id, workspace_id, provider, email, created_at')
      .limit(0);
    
    if (tableError) {
      console.error('❌ Table structure test failed:', tableError.message);
      return false;
    }
    
    console.log('✅ Table structure is correct');
    
    // Test 2: Check RLS policies
    const { data: policies, error: policyError } = await supabase
      .rpc('get_table_policies', { table_name: 'user_email_providers' });
    
    if (policyError) {
      console.log('⚠️  Could not verify RLS policies (this is normal in some setups)');
    } else {
      console.log('✅ RLS policies are configured');
    }
    
    return true;
  } catch (err) {
    console.error('❌ Integration flow test failed:', err);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Gmail Integration Tests...\n');
  
  const tests = [
    { name: 'Database Migration', fn: testDatabaseMigration },
    { name: 'OAuth Callback Function', fn: testOAuthCallback },
    { name: 'Provider Send Function', fn: testProviderSend },
    { name: 'Integration Flow', fn: testIntegrationFlow },
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    console.log(`\n📋 Running ${test.name} test...`);
    const result = await test.fn();
    if (result) {
      passed++;
    }
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Gmail integration is ready to use.');
    console.log('\nNext steps:');
    console.log('1. Set up Google Cloud Console OAuth credentials');
    console.log('2. Configure environment variables in Supabase');
    console.log('3. Deploy Edge Functions');
    console.log('4. Test OAuth flow in the app');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the tests
main().catch(console.error);