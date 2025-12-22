#!/usr/bin/env tsx

/**
 * Test script for Pre-Send Suppression Guard
 * 
 * This script tests the complete flow:
 * 1. Creates a test campaign with mixed recipients (valid, suppressed, invalid)
 * 2. Tests the pre-send check API
 * 3. Tests the fix list functionality
 * 4. Verifies metrics logging
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testPresendGuard() {
  console.log('🧪 Testing Pre-Send Suppression Guard...\n');

  try {
    // 1. Create a test user and campaign
    console.log('1. Creating test campaign...');
    
    const testUserId = 'test-user-' + Date.now();
    const testCampaignId = 'test-campaign-' + Date.now();
    
    // Insert test campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns_new')
      .insert({
        id: testCampaignId,
        user_id: testUserId,
        name: 'Test Campaign for Suppression Guard',
        subject: 'Test Subject',
        from_email: 'test@example.com',
        body_text: 'Test body',
        status: 'draft',
        total_recipients: 0
      })
      .select()
      .single();

    if (campaignError) {
      console.error('❌ Failed to create campaign:', campaignError);
      return;
    }
    console.log('✅ Campaign created:', campaign.id);

    // 2. Create test recipients with different statuses
    console.log('\n2. Creating test recipients...');
    
    const testRecipients = [
      { email: 'valid1@example.com', name: 'Valid User 1' },
      { email: 'valid2@example.com', name: 'Valid User 2' },
      { email: 'suppressed@example.com', name: 'Suppressed User' },
      { email: 'invalid-email', name: 'Invalid User' },
      { email: 'bounced@example.com', name: 'Bounced User' }
    ];

    const { data: recipients, error: recipientsError } = await supabase
      .from('campaign_recipients_new')
      .insert(
        testRecipients.map(r => ({
          campaign_id: testCampaignId,
          user_id: testUserId,
          email: r.email,
          name: r.name,
          status: 'pending'
        }))
      )
      .select();

    if (recipientsError) {
      console.error('❌ Failed to create recipients:', recipientsError);
      return;
    }
    console.log('✅ Recipients created:', recipients.length);

    // 3. Create some suppressions
    console.log('\n3. Creating test suppressions...');
    
    const { error: suppressionError } = await supabase
      .from('suppressions')
      .insert([
        {
          workspace_id: testUserId,
          email: 'suppressed@example.com',
          reason: 'manual'
        },
        {
          workspace_id: testUserId,
          email: 'bounced@example.com',
          reason: 'bounced'
        }
      ]);

    if (suppressionError) {
      console.error('❌ Failed to create suppressions:', suppressionError);
      return;
    }
    console.log('✅ Suppressions created');

    // 4. Test the pre-send check API
    console.log('\n4. Testing pre-send check API...');
    
    const presendCheckResponse = await fetch(`http://localhost:3000/api/campaigns/${testCampaignId}/presend-check`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token=test-token` // Mock auth
      }
    });

    if (!presendCheckResponse.ok) {
      console.error('❌ Pre-send check failed:', await presendCheckResponse.text());
      return;
    }

    const presendData = await presendCheckResponse.json();
    console.log('✅ Pre-send check results:');
    console.log('   Total recipients:', presendData.total);
    console.log('   Suppressed (global):', presendData.suppressed_global);
    console.log('   Suppressed (campaign):', presendData.suppressed_campaign);
    console.log('   Invalid:', presendData.invalid);
    console.log('   Final sendable:', presendData.final_sendable);
    console.log('   Blocked contacts:', presendData.blocked.length);

    // 5. Test the fix list functionality
    if (presendData.blocked.length > 0) {
      console.log('\n5. Testing fix list functionality...');
      
      const blockedIds = presendData.blocked.map((b: any) => b.id);
      const fixResponse = await fetch(`http://localhost:3000/api/campaigns/${testCampaignId}/presend-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token=test-token`
        },
        body: JSON.stringify({ exclude_contact_ids: blockedIds })
      });

      if (!fixResponse.ok) {
        console.error('❌ Fix list failed:', await fixResponse.text());
        return;
      }

      const fixData = await fixResponse.json();
      console.log('✅ Fix list results:');
      console.log('   Excluded count:', fixData.excluded_count);
      console.log('   Final sendable:', fixData.final_sendable);

      // 6. Verify send_attempts logging
      console.log('\n6. Verifying metrics logging...');
      
      const { data: sendAttempts, error: attemptsError } = await supabase
        .from('send_attempts')
        .select('*')
        .eq('campaign_id', testCampaignId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (attemptsError) {
        console.error('❌ Failed to fetch send attempts:', attemptsError);
        return;
      }

      if (sendAttempts && sendAttempts.length > 0) {
        console.log('✅ Send attempt logged:');
        console.log('   Attempted:', sendAttempts[0].attempted);
        console.log('   Blocked suppressed:', sendAttempts[0].blocked_suppressed);
        console.log('   Blocked invalid:', sendAttempts[0].blocked_invalid);
        console.log('   Final sendable:', sendAttempts[0].final_sendable);
      } else {
        console.log('⚠️  No send attempts found in database');
      }
    }

    console.log('\n🎉 Pre-Send Suppression Guard test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await supabase.from('send_attempts').delete().like('campaign_id', 'test-campaign-%');
    await supabase.from('campaign_recipients_new').delete().like('campaign_id', 'test-campaign-%');
    await supabase.from('campaigns_new').delete().like('id', 'test-campaign-%');
    await supabase.from('suppressions').delete().like('workspace_id', 'test-user-%');
    console.log('✅ Cleanup completed');
  }
}

// Run the test
testPresendGuard().catch(console.error);