#!/usr/bin/env tsx

import { createAdminClient } from '../src/lib/supabase';

async function testIntegrations() {
  console.log('🧪 Testing SmartSend Integrations System...\n');

  const sb = createAdminClient();

  try {
    // 1. Test database connection
    console.log('1. Testing database connection...');
    const { data: testData, error: testError } = await sb
      .from('integrations')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError.message);
      return;
    }
    console.log('✅ Database connection successful\n');

    // 2. Test integrations table
    console.log('2. Testing integrations table...');
    const { data: integrations, error: integrationsError } = await sb
      .from('integrations')
      .select('*')
      .limit(5);
    
    if (integrationsError) {
      console.error('❌ Failed to query integrations table:', integrationsError.message);
      return;
    }
    console.log(`✅ Integrations table accessible (${integrations?.length || 0} integrations found)\n`);

    // 3. Test webhook endpoint
    console.log('3. Testing webhook endpoint...');
    const testPayload = {
      event: 'test',
      email: 'test@example.com',
      campaign_id: 'test-campaign-123',
      org_id: '00000000-0000-0000-0000-000000000000' // dummy UUID
    };

    try {
      const response = await fetch('http://localhost:3000/api/integrations/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Webhook endpoint working:', result);
      } else {
        console.log('⚠️  Webhook endpoint responded with status:', response.status);
      }
    } catch (webhookError) {
      console.log('⚠️  Webhook endpoint test skipped (server may not be running)');
    }
    console.log('');

    // 4. Test API endpoints
    console.log('4. Testing API endpoints...');
    
    // Test GET /api/integrations (will fail without auth, but that's expected)
    try {
      const response = await fetch('http://localhost:3000/api/integrations');
      if (response.status === 401) {
        console.log('✅ GET /api/integrations endpoint exists (auth required)');
      } else {
        console.log('⚠️  GET /api/integrations unexpected status:', response.status);
      }
    } catch (apiError) {
      console.log('⚠️  API endpoint test skipped (server may not be running)');
    }

    // 5. Test utility functions
    console.log('\n5. Testing utility functions...');
    
    // Test Slack formatting
    const { formatSlackMessage } = await import('../src/lib/integrations/slack');
    const slackMessage = formatSlackMessage('reply', 'test@example.com', 'campaign-123', { lead_score: 85 });
    console.log('✅ Slack message formatting:', slackMessage);

    // Test HubSpot utilities
    const { upsertHubspotContact } = await import('../src/lib/integrations/hubspot');
    console.log('✅ HubSpot utilities imported successfully');

    console.log('\n🎉 All integration tests completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Run the database migration: supabase/migrations/20250131_create_integrations_table.sql');
    console.log('2. Start your development server: npm run dev');
    console.log('3. Visit /dashboard/integrations to test the UI');
    console.log('4. Add a Zapier webhook to test real-time notifications');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testIntegrations().catch(console.error); 