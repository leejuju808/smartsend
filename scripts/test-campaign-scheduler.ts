// scripts/test-campaign-scheduler.ts
// Test script for the campaign scheduler system

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCampaignScheduler() {
  console.log('🧪 Testing Campaign Scheduler System...\n');

  try {
    // 1. Test RPC function for claiming recipients
    console.log('1. Testing smartsend_claim_due_recipients RPC...');
    const { data: claimedRecipients, error: claimError } = await supabase.rpc('smartsend_claim_due_recipients', {
      p_limit: 5
    });

    if (claimError) {
      console.error('❌ RPC function error:', claimError);
    } else {
      console.log('✅ RPC function working, claimed recipients:', claimedRecipients?.length || 0);
    }

    // 2. Test campaign completion RPC
    console.log('\n2. Testing smartsend_update_completed_campaigns RPC...');
    const { error: completeError } = await supabase.rpc('smartsend_update_completed_campaigns');

    if (completeError) {
      console.error('❌ Campaign completion RPC error:', completeError);
    } else {
      console.log('✅ Campaign completion RPC working');
    }

    // 3. Test edge function endpoint
    console.log('\n3. Testing send-queue edge function...');
    const functionUrl = `${supabaseUrl}/functions/v1/send-queue`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      console.error('❌ Edge function error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
    } else {
      const result = await response.json();
      console.log('✅ Edge function working:', result);
    }

    // 4. Check database tables exist
    console.log('\n4. Checking database tables...');
    
    const tables = ['campaigns', 'campaign_recipients', 'email_logs'];
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.error(`❌ Table ${table} error:`, error.message);
      } else {
        console.log(`✅ Table ${table} accessible`);
      }
    }

    // 5. Test creating a sample campaign
    console.log('\n5. Testing campaign creation...');
    
    const testCampaign = {
      workspace_id: '00000000-0000-0000-0000-000000000000', // Replace with actual workspace ID
      name: 'Test Campaign - ' + new Date().toISOString(),
      scheduled_for: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      status: 'scheduled'
    };

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert(testCampaign)
      .select()
      .single();

    if (campaignError) {
      console.error('❌ Campaign creation error:', campaignError);
    } else {
      console.log('✅ Campaign created:', campaign.id);

      // Create test recipient
      const testRecipient = {
        campaign_id: campaign.id,
        recipient: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test email body',
        scheduled_at: new Date(Date.now() + 60000).toISOString(),
        status: 'queued'
      };

      const { data: recipient, error: recipientError } = await supabase
        .from('campaign_recipients')
        .insert(testRecipient)
        .select()
        .single();

      if (recipientError) {
        console.error('❌ Recipient creation error:', recipientError);
      } else {
        console.log('✅ Test recipient created:', recipient.id);
        
        // Clean up test data
        await supabase.from('campaign_recipients').delete().eq('id', recipient.id);
        await supabase.from('campaigns').delete().eq('id', campaign.id);
        console.log('🧹 Test data cleaned up');
      }
    }

    console.log('\n🎉 Campaign Scheduler test completed!');
    console.log('\nNext steps:');
    console.log('1. Set up the Supabase Scheduler cron job (see CAMPAIGN_SCHEDULER_SETUP.md)');
    console.log('2. Replace the test workspace_id with a real one');
    console.log('3. Test the full flow by creating a campaign through the UI');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCampaignScheduler();