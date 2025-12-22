#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createDemoData() {
  console.log('🚀 Creating demo data for reports...\n');

  try {
    // Create a demo user if it doesn't exist
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: 'demo@smartsend.ai',
      password: 'demo123456',
      email_confirm: true
    });

    let userId = user?.user?.id;
    if (userError && userError.message.includes('already registered')) {
      // User exists, get their ID
      const { data: existingUser } = await supabase.auth.admin.listUsers();
      userId = existingUser.users.find(u => u.email === 'demo@smartsend.ai')?.id;
    }

    if (!userId) {
      console.error('❌ Could not create or find demo user');
      return;
    }

    console.log('✅ Demo user ready:', userId);

    // Create demo campaigns
    const campaigns = [
      { title: 'Q1 Product Launch', subject: 'Introducing Our New Platform', body: 'Exciting news about our latest release...' },
      { title: 'Holiday Special', subject: 'Limited Time Offer Inside', body: 'Don\'t miss our seasonal promotion...' },
      { title: 'Customer Success Stories', subject: 'See How Others Succeed', body: 'Real results from real customers...' }
    ];

    const createdCampaigns = [];
    for (const campaign of campaigns) {
      const { data: createdCampaign, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: userId,
          title: campaign.title,
          subject: campaign.subject,
          body: campaign.body,
          status: 'completed'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Campaign creation failed:', error.message);
        continue;
      }

      createdCampaigns.push(createdCampaign);
      console.log('✅ Created campaign:', campaign.title);
    }

    // Create demo campaign recipients
    const recipients = [
      'john@example.com',
      'sarah@example.com',
      'mike@example.com',
      'lisa@example.com',
      'david@example.com'
    ];

    for (const campaign of createdCampaigns) {
      for (const email of recipients) {
        const { error } = await supabase
          .from('campaign_recipients')
          .insert({
            campaign_id: campaign.id,
            email: email,
            open_count: Math.floor(Math.random() * 3),
            click_count: Math.floor(Math.random() * 2),
            last_open_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
            last_click_at: Math.random() > 0.7 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : null
          });

        if (error) {
          console.error('❌ Recipient creation failed:', error.message);
        }
      }
    }

    console.log('✅ Created campaign recipients');

    // Create demo email events
    for (const campaign of createdCampaigns) {
      for (const email of recipients) {
        // Get recipient ID
        const { data: recipient } = await supabase
          .from('campaign_recipients')
          .select('id')
          .eq('campaign_id', campaign.id)
          .eq('email', email)
          .single();

        if (!recipient) continue;

        // Create open events
        if (Math.random() > 0.3) {
          await supabase
            .from('email_events')
            .insert({
              user_id: userId,
              campaign_id: campaign.id,
              recipient_id: recipient.id,
              type: 'open',
              created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
            });
        }

        // Create click events (less frequent)
        if (Math.random() > 0.7) {
          await supabase
            .from('email_events')
            .insert({
              user_id: userId,
              campaign_id: campaign.id,
              recipient_id: recipient.id,
              type: 'click',
              url: 'https://example.com/offer',
              created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
            });
        }
      }
    }

    console.log('✅ Created email events');

    // Create demo sequences
    const sequences = [
      { name: 'Welcome Series', steps: 3 },
      { name: 'Product Onboarding', steps: 5 },
      { name: 'Re-engagement', steps: 2 }
    ];

    for (const sequence of sequences) {
      const { data: createdSequence, error } = await supabase
        .from('sequences')
        .insert({
          name: sequence.name,
          created_by: userId
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Sequence creation failed:', error.message);
        continue;
      }

      // Create sequence steps
      for (let i = 1; i <= sequence.steps; i++) {
        await supabase
          .from('sequence_steps')
          .insert({
            sequence_id: createdSequence.id,
            step_order: i,
            subject: `Step ${i}: ${sequence.name}`,
            body_text: `This is step ${i} of the ${sequence.name} sequence.`,
            delay_days: (i - 1) * 2
          });
      }

      // Create sequence enrollments
      for (const email of recipients.slice(0, 3)) {
        await supabase
          .from('sequence_enrollments')
          .insert({
            sequence_id: createdSequence.id,
            email: email,
            current_step: Math.floor(Math.random() * sequence.steps),
            last_sent: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
          });
      }

      console.log('✅ Created sequence:', sequence.name);
    }

    // Create demo reply events
    for (let i = 0; i < 5; i++) {
      await supabase
        .from('events')
        .insert({
          user_id: userId,
          event: 'reply',
          meta: { type: 'email', campaign_id: createdCampaigns[0]?.id },
          recipient_email: recipients[i],
          created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        });
    }

    console.log('✅ Created reply events');

    console.log('\n🎉 Demo data creation completed!');
    console.log('\n📊 What was created:');
    console.log('- 3 campaigns with recipients and events');
    console.log('- 3 email sequences with steps and enrollments');
    console.log('- Email events (opens, clicks)');
    console.log('- Reply events');
    console.log('\n🔗 Test the reports at: /dashboard/reports');
    console.log('👤 Demo user: demo@smartsend.ai / demo123456');

  } catch (error) {
    console.error('❌ Demo data creation failed:', error);
  }
}

// Run the demo data creation
createDemoData().catch(console.error); 