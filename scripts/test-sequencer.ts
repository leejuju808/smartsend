#!/usr/bin/env tsx

/**
 * SmartSend Sequencer Test Script
 * 
 * This script demonstrates how to:
 * 1. Create a campaign with multiple steps (D0/D3/D7)
 * 2. Queue contacts to the campaign
 * 3. Watch the sequence progress automatically
 * 
 * Run with: npm run test:sequencer
 */

import { createAdminClient } from '../src/lib/supabase';

const supabase = createAdminClient();

async function testSequencer() {
  console.log('🚀 Testing SmartSend Sequencer...\n');

  try {
    // 1. Create a test campaign
    console.log('1️⃣ Creating test campaign...');
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: 'Test Sequence Campaign',
        subject: 'Initial Outreach',
        body_html: '<p>Hi {{name}}, this is our initial outreach.</p>',
        from_name: 'Test Sender',
        from_email: 'test@example.com',
        status: 'draft',
        is_sequence: false, // Will be updated when steps are added
        current_step: 0,
        last_sent_step: -1
      })
      .select()
      .single();

    if (campaignError) throw campaignError;
    console.log(`✅ Campaign created: ${campaign.id}`);

    // 2. Add sequence steps (D0/D3/D7)
    console.log('\n2️⃣ Adding sequence steps...');
    const steps = [
      {
        campaign_id: campaign.id,
        step_index: 0,
        subject: 'Initial Outreach - {{company}}',
        body_html: `
          <p>Hi {{name}},</p>
          <p>I noticed {{company}} and thought you might be interested in our solution.</p>
          <p>Would you be open to a quick call next week?</p>
          <p>Best,<br>Test Sender</p>
        `,
        delay_days: 0
      },
      {
        campaign_id: campaign.id,
        step_index: 1,
        subject: 'Following up - {{company}}',
        body_html: `
          <p>Hi {{name}},</p>
          <p>I wanted to follow up on my previous email about {{company}}.</p>
          <p>Have you had a chance to think about this?</p>
          <p>Best,<br>Test Sender</p>
        `,
        delay_days: 3
      },
      {
        campaign_id: campaign.id,
        step_index: 2,
        subject: 'Final follow-up - {{company}}',
        body_html: `
          <p>Hi {{name}},</p>
          <p>This is my final follow-up regarding {{company}}.</p>
          <p>If you're interested, just let me know. If not, I'll remove you from my list.</p>
          <p>Best,<br>Test Sender</p>
        `,
        delay_days: 7
      }
    ];

    const { error: stepsError } = await supabase
      .from('campaign_steps')
      .insert(steps);

    if (stepsError) throw stepsError;
    console.log('✅ 3 sequence steps added (D0/D3/D7)');

    // 3. Update campaign to mark as sequence
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ 
        is_sequence: true,
        current_step: 0,
        last_sent_step: -1
      })
      .eq('id', campaign.id);

    if (updateError) throw updateError;
    console.log('✅ Campaign marked as sequence');

    // 4. Create test contacts
    console.log('\n3️⃣ Creating test contacts...');
    const contacts = [
      { name: 'John Doe', email: 'john.doe@example.com', company: 'Acme Corp' },
      { name: 'Jane Smith', email: 'jane.smith@example.com', company: 'TechStart Inc' },
      { name: 'Bob Johnson', email: 'bob.johnson@example.com', company: 'Global Solutions' }
    ];

    const { data: createdContacts, error: contactsError } = await supabase
      .from('contacts')
      .insert(contacts)
      .select();

    if (contactsError) throw contactsError;
    console.log(`✅ ${createdContacts.length} test contacts created`);

    // 5. Queue contacts to campaign (step 0)
    console.log('\n4️⃣ Queueing contacts to campaign...');
    const queueEntries = createdContacts.map((contact: any, index: number) => ({
      campaign_id: campaign.id,
      user_id: '00000000-0000-0000-0000-000000000000', // Replace with actual user ID
      contact_id: contact.id,
      email_lower: contact.email.toLowerCase(),
      name: contact.name,
      status: 'queued',
      step_index: 0,
      last_sent_step: -1,
      next_eligible_at: new Date(Date.now() + index * 1000).toISOString() // Stagger by 1 second
    }));

    const { error: queueError } = await supabase
      .from('campaign_recipients')
      .insert(queueEntries);

    if (queueError) throw queueError;
    console.log('✅ Contacts queued for step 0');

    // 6. Start the campaign
    console.log('\n5️⃣ Starting campaign...');
    const { error: startError } = await supabase
      .from('campaigns')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', campaign.id);

    if (startError) throw startError;
    console.log('✅ Campaign started');

    // 7. Show current state
    console.log('\n📊 Current Campaign State:');
    const { data: currentState } = await supabase
      .from('campaign_recipients')
      .select('step_index, status, next_eligible_at')
      .eq('campaign_id', campaign.id)
      .order('step_index');

    console.table(currentState);

    console.log('\n🎯 What happens next:');
    console.log('• Cron job will send step 0 emails immediately');
    console.log('• After each send, recipients are re-queued for step 1 (3 days later)');
    console.log('• Step 1 sends are scheduled for 3 days after step 0');
    console.log('• Step 2 sends are scheduled for 7 days after step 1');
    console.log('• If a contact replies, future sends are automatically purged');
    console.log('• If a contact unsubscribes, future sends are automatically purged');

    console.log('\n✅ Sequencer test setup complete!');
    console.log(`Campaign ID: ${campaign.id}`);
    console.log('Run the cron job to see it in action.');

  } catch (error) {
    console.error('❌ Error testing sequencer:', error);
  }
}

// Run the test
testSequencer().catch(console.error); 