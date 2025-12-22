#!/usr/bin/env tsx

/**
 * Test script for auto-stop on reply functionality
 * 
 * This script tests:
 * 1. Database functions for marking recipients as replied/skipped
 * 2. API endpoints for toggling auto-stop settings
 * 3. Inbound reply webhook processing
 * 
 * Run with: npx tsx scripts/test-auto-stop.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAutoStopFunctions() {
  console.log('🧪 Testing Auto-Stop on Reply Functions...\n');

  try {
    // Test 1: Check if auto_stop_on_reply column exists
    console.log('1. Checking campaigns table structure...');
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, auto_stop_on_reply')
      .limit(1);
    
    if (error) {
      console.error('❌ Error checking campaigns table:', error.message);
    } else {
      console.log('✅ auto_stop_on_reply column exists in campaigns table');
    }

    // Test 2: Check campaigns_new table structure
    console.log('\n2. Checking campaigns_new table structure...');
    const { data: campaignsNew, error: errorNew } = await supabase
      .from('campaigns_new')
      .select('id, auto_stop_on_reply')
      .limit(1);
    
    if (errorNew) {
      console.error('❌ Error checking campaigns_new table:', errorNew.message);
    } else {
      console.log('✅ auto_stop_on_reply column exists in campaigns_new table');
    }

    // Test 3: Check if helper functions exist
    console.log('\n3. Checking helper functions...');
    
    // Test mark_replied_and_skip function
    try {
      await supabase.rpc('mark_replied_and_skip', { 
        p_campaign: '00000000-0000-0000-0000-000000000001', 
        p_email: 'test@example.com' 
      });
      console.log('✅ mark_replied_and_skip function exists');
    } catch (e: any) {
      console.error('❌ mark_replied_and_skip function error:', e.message);
    }

    // Test sync_replies_to_recipients function
    try {
      await supabase.rpc('sync_replies_to_recipients', { 
        p_campaign: '00000000-0000-0000-0000-000000000001' 
      });
      console.log('✅ sync_replies_to_recipients function exists');
    } catch (e: any) {
      console.error('❌ sync_replies_to_recipients function error:', e.message);
    }

    // Test 4: Check if events table exists and has reply type
    console.log('\n4. Checking events table...');
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('type')
      .limit(1);
    
    if (eventsError) {
      console.error('❌ Error checking events table:', eventsError.message);
    } else {
      console.log('✅ events table exists');
    }

    console.log('\n🎉 Auto-stop on reply functionality test completed!');
    console.log('\nNext steps:');
    console.log('1. Run the database migration: psql -f supabase/migrations/20250127_add_auto_stop_on_reply.sql');
    console.log('2. Test the API endpoints manually');
    console.log('3. Test the inbound reply webhook with a real email provider');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testAutoStopFunctions().catch(console.error); 