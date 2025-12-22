#!/usr/bin/env tsx

/**
 * Test script for SmartSend Tracking System
 * 
 * Run with: npx tsx scripts/test-tracking.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTracking() {
  console.log('🧪 Testing SmartSend Tracking System...\n');

  try {
    // Test 1: Check if tracking tables exist
    console.log('1. Checking tracking tables...');
    
    const { data: trackingLinks, error: tlError } = await supabase
      .from('tracking_links')
      .select('count')
      .limit(1);
    
    if (tlError) {
      console.log('❌ tracking_links table not found or accessible');
      console.log('   Run the SQL migration first: supabase/migrations/20250140000001_create_tracking_system.sql');
      return;
    }
    
    console.log('✅ tracking_links table accessible');
    
    const { data: openTokens, error: otError } = await supabase
      .from('open_tokens')
      .select('count')
      .limit(1);
    
    if (otError) {
      console.log('❌ open_tokens table not found or accessible');
      return;
    }
    
    console.log('✅ open_tokens table accessible');
    
    // Test 2: Check RLS function
    console.log('\n2. Testing RLS function...');
    
    const testWorkspaceId = '00000000-0000-0000-0000-000000000000';
    const { error: rlsError } = await supabase.rpc('app.set_workspace', { id: testWorkspaceId });
    
    if (rlsError) {
      console.log('❌ app.set_workspace function not found');
      console.log('   Make sure the SQL migration was run completely');
      return;
    }
    
    console.log('✅ app.set_workspace function accessible');
    
    // Test 3: Check if we can insert test data
    console.log('\n3. Testing data insertion...');
    
    const testToken = 'test_' + Date.now();
    const { error: insertError } = await supabase
      .from('tracking_links')
      .insert({
        token: testToken,
        workspace_id: testWorkspaceId,
        url: 'https://example.com/test',
        email: 'test@example.com'
      });
    
    if (insertError) {
      console.log('❌ Cannot insert into tracking_links');
      console.log('   Error:', insertError.message);
      return;
    }
    
    console.log('✅ Can insert tracking data');
    
    // Clean up test data
    await supabase
      .from('tracking_links')
      .delete()
      .eq('token', testToken);
    
    console.log('\n🎉 All tracking system tests passed!');
    console.log('\nNext steps:');
    console.log('1. Add environment variables to .env.local');
    console.log('2. Send a test sequence email');
    console.log('3. Check /dashboard/analytics for data');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testTracking(); 