#!/usr/bin/env tsx

/**
 * Test script for Email A/B Testing System
 * Run with: npx tsx scripts/test-ab-testing-email.ts
 * 
 * This script demonstrates:
 * 1. Creating A/B tests for campaigns and sequences
 * 2. Assigning variants to contacts
 * 3. Tracking metrics per variant
 * 4. Declaring winners
 */

import { supabaseAdmin } from "../src/server/supabase";

async function testEmailABTesting() {
  console.log("🧪 Testing Email A/B Testing System...\n");

  try {
    // 1. Create a test campaign A/B test
    console.log("1. Creating Campaign A/B Test...");
    const { data: campaignTest, error: campaignTestError } = await supabaseAdmin
      .from("ab_tests")
      .insert({
        parent_kind: "campaign",
        parent_id: "00000000-0000-0000-0000-000000000001", // Mock campaign ID
        name: "Subject Line Test - Q1 Campaign",
        status: "running"
      })
      .select()
      .single();

    if (campaignTestError) {
      console.log("❌ Error creating campaign A/B test:", campaignTestError.message);
      return;
    }

    console.log("✅ Campaign A/B test created:", campaignTest.id);

    // 2. Create variants for the campaign test
    console.log("\n2. Creating Campaign Variants...");
    const campaignVariants = [
      {
        ab_test_id: campaignTest.id,
        subject: "🚀 Boost Your Sales This Quarter",
        body_text: "Discover proven strategies to increase your revenue...",
        body_html: "<h1>Boost Your Sales</h1><p>Discover proven strategies...</p>",
        traffic_split: 50
      },
      {
        ab_test_id: campaignTest.id,
        subject: "💡 Q1 Revenue Optimization Guide",
        body_text: "Learn how top performers optimize their revenue...",
        body_html: "<h1>Q1 Revenue Guide</h1><p>Learn how top performers...</p>",
        traffic_split: 50
      }
    ];

    const { data: insertedCampaignVariants, error: campaignVariantsError } = await supabaseAdmin
      .from("ab_variants")
      .insert(campaignVariants)
      .select();

    if (campaignVariantsError) {
      console.log("❌ Error creating campaign variants:", campaignVariantsError.message);
      return;
    }

    console.log("✅ Created", insertedCampaignVariants.length, "campaign variants");

    // 3. Create a test sequence A/B test
    console.log("\n3. Creating Sequence A/B Test...");
    const { data: sequenceTest, error: sequenceTestError } = await supabaseAdmin
      .from("ab_tests")
      .insert({
        parent_kind: "sequence",
        parent_id: "00000000-0000-0000-0000-000000000002", // Mock sequence ID
        name: "Follow-up Sequence Test",
        status: "running"
      })
      .select()
      .single();

    if (sequenceTestError) {
      console.log("❌ Error creating sequence A/B test:", sequenceTestError.message);
      return;
    }

    console.log("✅ Sequence A/B test created:", sequenceTest.id);

    // 4. Create variants for the sequence test
    console.log("\n4. Creating Sequence Variants...");
    const sequenceVariants = [
      {
        ab_test_id: sequenceTest.id,
        subject: "Quick follow-up on our conversation",
        body_text: "Hi there, I wanted to follow up on our recent discussion...",
        body_html: "<p>Hi there,</p><p>I wanted to follow up on our recent discussion...</p>",
        traffic_split: 33
      },
      {
        ab_test_id: sequenceTest.id,
        subject: "Checking in - any questions?",
        body_text: "Hello! I hope you're doing well. Do you have any questions...",
        body_html: "<p>Hello!</p><p>I hope you're doing well. Do you have any questions...</p>",
        traffic_split: 33
      },
      {
        ab_test_id: sequenceTest.id,
        subject: "Following up - next steps",
        body_text: "Hi! I'm following up to see if you'd like to discuss next steps...",
        body_html: "<p>Hi!</p><p>I'm following up to see if you'd like to discuss next steps...</p>",
        traffic_split: 34
      }
    ];

    const { data: insertedSequenceVariants, error: sequenceVariantsError } = await supabaseAdmin
      .from("ab_variants")
      .insert(sequenceVariants)
      .select();

    if (sequenceVariantsError) {
      console.log("❌ Error creating sequence variants:", sequenceVariantsError.message);
      return;
    }

    console.log("✅ Created", insertedSequenceVariants.length, "sequence variants");

    // 5. Test variant assignment function
    console.log("\n5. Testing Variant Assignment...");
    
    // Test campaign variant assignment
    const { data: campaignVariant } = await supabaseAdmin.rpc('get_ab_test_variant', {
      p_parent_kind: 'campaign',
      p_parent_id: '00000000-0000-0000-0000-000000000001'
    });
    
    console.log("   Campaign variant assigned:", campaignVariant ? "Yes" : "No");

    // Test sequence variant assignment
    const { data: sequenceVariant } = await supabaseAdmin.rpc('get_ab_test_variant', {
      p_parent_kind: 'sequence',
      p_parent_id: '00000000-0000-0000-0000-000000000002'
    });
    
    console.log("   Sequence variant assigned:", sequenceVariant ? "Yes" : "No");

    // 6. Simulate sending emails with variants
    console.log("\n6. Simulating Email Sends...");
    
    // Simulate campaign sends
    for (let i = 0; i < 10; i++) {
      const variant = await supabaseAdmin.rpc('get_ab_test_variant', {
        p_parent_kind: 'campaign',
        p_parent_id: '00000000-0000-0000-0000-000000000001'
      });
      
      if (variant) {
        // Log the send event with variant
        await supabaseAdmin
          .from("events")
          .insert({
            event: "email_sent",
            meta: {
              campaign_id: "00000000-0000-0000-0000-000000000001",
              variant_id: variant,
              recipient: `test${i}@example.com`,
              sent_at: new Date().toISOString()
            },
            variant_id: variant
          });
      }
    }
    
    console.log("   Simulated 10 campaign sends with variant tracking");

    // 7. Test winner declaration
    console.log("\n7. Testing Winner Declaration...");
    
    const { error: winnerError } = await supabaseAdmin.rpc('declare_ab_test_winner', {
      p_test_id: campaignTest.id,
      p_winner_variant_id: insertedCampaignVariants[0].id
    });
    
    if (winnerError) {
      console.log("❌ Error declaring winner:", winnerError.message);
    } else {
      console.log("✅ Winner declared for campaign test");
    }

    // 8. Verify test status
    console.log("\n8. Verifying Test Status...");
    
    const { data: updatedTest, error: statusError } = await supabaseAdmin
      .from("ab_tests")
      .select("status, winner_variant_id")
      .eq("id", campaignTest.id)
      .single();
    
    if (statusError) {
      console.log("❌ Error checking test status:", statusError.message);
    } else {
      console.log("   Campaign test status:", updatedTest.status);
      console.log("   Winner variant:", updatedTest.winner_variant_id ? "Declared" : "None");
    }

    // 9. Show all A/B tests
    console.log("\n9. All A/B Tests Summary:");
    
    const { data: allTests, error: allTestsError } = await supabaseAdmin
      .from("ab_tests")
      .select(`
        *,
        ab_variants (count)
      `);
    
    if (allTestsError) {
      console.log("❌ Error fetching tests:", allTestsError.message);
    } else {
      allTests?.forEach(test => {
        console.log(`   - ${test.name} (${test.status}): ${test.ab_variants?.[0]?.count || 0} variants`);
      });
    }

    console.log("\n🎉 Email A/B Testing system test completed!");
    console.log("\nNext steps:");
    console.log("1. Visit /dashboard/abtest to see the A/B testing dashboard");
    console.log("2. Create real A/B tests for your campaigns and sequences");
    console.log("3. Monitor performance metrics in real-time");
    console.log("4. Declare winners when tests are complete");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testEmailABTesting().catch(console.error); 