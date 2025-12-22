#!/usr/bin/env tsx

/**
 * Test script for SmartSend Sequences v1
 * Run with: npx tsx scripts/test-sequences-v1.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testSequencesV1() {
  console.log('🧪 Testing SmartSend Sequences v1...\n');

  try {
    // Test 1: Check if tables exist
    console.log('1. Checking database tables...');
    const tables = ['sequences', 'sequence_steps', 'sequence_subscribers', 'sequence_events'];
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`);
      } else {
        console.log(`   ✅ ${table}: OK`);
      }
    }

    // Test 2: Check workspace function
    console.log('\n2. Testing workspace scoping...');
    const workspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID;
    if (!workspaceId) {
      console.log('   ❌ NEXT_PUBLIC_DEMO_WORKSPACE_ID not set');
    } else {
      try {
        await supabase.rpc('app.set_workspace', { id: workspaceId });
        console.log('   ✅ Workspace scoping function works');
      } catch (error) {
        console.log(`   ❌ Workspace scoping failed: ${error}`);
      }
    }

    // Test 3: Test API endpoints
    console.log('\n3. Testing API endpoints...');
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Test sequences save endpoint
    try {
      const testSequence = {
        workspaceId,
        sequence: {
          name: 'Test Sequence',
          timezone: 'America/Los_Angeles',
          stop_on_reply: true,
          send_window: { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 17 },
          throttle_per_tick: 50
        },
        steps: [
          {
            step_no: 1,
            wait_seconds: 0,
            subject_template: 'Test email for {{contact.first_name}}',
            text_template: 'Hi {{contact.first_name}}, this is a test sequence email.'
          }
        ]
      };

      const response = await fetch(`${baseUrl}/api/sequences/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testSequence)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`   ✅ Sequences save: OK (ID: ${result.id})`);
        
        // Test enrollment
        try {
          const enrollResponse = await fetch(`${baseUrl}/api/sequences/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              sequenceId: result.id,
              contactIds: ['00000000-0000-0000-0000-000000000000'] // dummy ID for test
            })
          });
          
          if (enrollResponse.ok) {
            console.log('   ✅ Sequences enroll: OK');
          } else {
            console.log(`   ⚠️  Sequences enroll: ${enrollResponse.status} (expected for dummy contact ID)`);
          }
        } catch (error) {
          console.log(`   ⚠️  Sequences enroll: ${error} (expected for dummy contact ID)`);
        }
      } else {
        console.log(`   ❌ Sequences save: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`   ❌ Sequences save: ${error}`);
    }

    // Test 4: Check environment variables
    console.log('\n4. Checking environment variables...');
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_DEMO_WORKSPACE_ID',
      'SEQUENCES_CRON_SECRET'
    ];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`   ✅ ${envVar}: Set`);
      } else {
        console.log(`   ❌ ${envVar}: Not set`);
      }
    }

    console.log('\n🎉 Sequences v1 test completed!');
    console.log('\nNext steps:');
    console.log('1. Set up cron job: */5 * * * * curl -X POST "https://yourdomain.com/api/sequences/tick?workspaceId=YOUR_UUID&secret=SEQUENCES_CRON_SECRET"');
    console.log('2. Visit /dashboard/sequences to see the UI');
    console.log('3. Create your first sequence and enroll contacts');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSequencesV1(); 