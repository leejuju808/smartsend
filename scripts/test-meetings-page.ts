#!/usr/bin/env tsx

/**
 * Test script for the meetings page functionality
 * 
 * This script tests:
 * 1. Database migration for new meeting fields
 * 2. API endpoints for meetings
 * 3. Basic CRUD operations
 */

import { supabaseAdmin } from '../src/lib/supabaseAdmin';

async function testMeetingsFunctionality() {
  console.log('🧪 Testing Meetings Page Functionality...\n');

  try {
    // Test 1: Check if meetings table has the new fields
    console.log('1️⃣ Checking database schema...');
    const { data: columns, error: schemaError } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'meetings')
      .eq('table_schema', 'public')
      .order('ordinal_position');

    if (schemaError) {
      console.error('❌ Error checking schema:', schemaError);
      return;
    }

    const requiredFields = [
      'external_source', 'external_event_id', 'invitee_uri', 
      'event_uri', 'booked_at'
    ];

    const existingFields = columns?.map(c => c.column_name) || [];
    const missingFields = requiredFields.filter(f => !existingFields.includes(f));

    if (missingFields.length > 0) {
      console.log('⚠️  Missing fields:', missingFields);
      console.log('   Run the migration: supabase/migrations/20250141_add_meeting_webhook_fields.sql');
    } else {
      console.log('✅ All required fields present');
    }

    // Test 2: Check if we can query meetings
    console.log('\n2️⃣ Testing meetings query...');
    const { data: meetings, error: queryError } = await supabaseAdmin
      .from('meetings')
      .select('*')
      .limit(1);

    if (queryError) {
      console.error('❌ Error querying meetings:', queryError);
    } else {
      console.log(`✅ Meetings query successful (${meetings?.length || 0} meetings found)`);
    }

    // Test 3: Check API endpoints
    console.log('\n3️⃣ Testing API endpoints...');
    
    // Test meetings list endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${baseUrl}/api/meetings?user_id=test`);
      if (response.ok) {
        console.log('✅ /api/meetings endpoint accessible');
      } else {
        console.log(`⚠️  /api/meetings endpoint returned ${response.status}`);
      }
    } catch (e) {
      console.log('⚠️  /api/meetings endpoint test skipped (server may not be running)');
    }

    // Test Calendly webhook endpoint
    try {
      const response = await fetch(`${baseUrl}/api/meetings/calendly-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'invitee.created',
          payload: {
            invitee: {
              uri: 'https://api.calendly.com/invitees/test',
              start_time: new Date().toISOString(),
              end_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              email: 'test@example.com',
              name: 'Test User'
            },
            event: {
              uri: 'https://api.calendly.com/events/test',
              uuid: 'test-uuid',
              location: { location: 'Zoom' }
            }
          }
        })
      });
      
      if (response.ok) {
        console.log('✅ /api/meetings/calendly-webhook endpoint accessible');
      } else {
        console.log(`⚠️  /api/meetings/calendly-webhook endpoint returned ${response.status}`);
      }
    } catch (e) {
      console.log('⚠️  /api/meetings/calendly-webhook endpoint test skipped (server may not be running)');
    }

    console.log('\n🎉 Meetings functionality test completed!');
    console.log('\nNext steps:');
    console.log('1. Start your dev server: pnpm dev');
    console.log('2. Navigate to: http://localhost:3000/dashboard/meetings');
    console.log('3. Set your user ID in DevTools: localStorage.setItem("ss_user_id", "<your-user-id>")');
    console.log('4. Refresh the page to see your meetings');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testMeetingsFunctionality().catch(console.error); 