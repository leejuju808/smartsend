#!/usr/bin/env tsx

/**
 * Test script for A/B testing system
 * Run with: npx tsx scripts/test-ab-testing.ts
 */

import { supabaseAdmin } from "../src/server/supabase";

async function testABTesting() {
  console.log("🧪 Testing A/B Testing System...\n");

  try {
    // 1. Check if experiment exists
    console.log("1. Checking experiment configuration...");
    const { data: experiment, error: expError } = await supabaseAdmin
      .from("experiments")
      .select("*")
      .eq("name", "upgrade_banner")
      .single();

    if (expError || !experiment) {
      console.log("❌ Experiment 'upgrade_banner' not found");
      console.log("   Run the SQL script or use the admin interface to create it");
      return;
    }

    console.log("✅ Experiment found:", experiment.name);
    console.log("   Variants:", experiment.variants);
    console.log("   ID:", experiment.id);

    // 2. Check experiment assignments
    console.log("\n2. Checking experiment assignments...");
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from("experiment_assignments")
      .select("*")
      .eq("experiment_id", experiment.id);

    if (assignError) {
      console.log("❌ Error fetching assignments:", assignError.message);
    } else {
      console.log(`✅ Found ${assignments?.length || 0} user assignments`);
      if (assignments && assignments.length > 0) {
        const variantCounts = assignments.reduce((acc, a) => {
          acc[a.variant] = (acc[a.variant] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log("   Variant distribution:", variantCounts);
      }
    }

    // 3. Check experiment events
    console.log("\n3. Checking experiment events...");
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("experiment_events")
      .select("*")
      .eq("experiment_id", experiment.id);

    if (eventsError) {
      console.log("❌ Error fetching events:", eventsError.message);
    } else {
      console.log(`✅ Found ${events?.length || 0} events`);
      if (events && events.length > 0) {
        const eventCounts = events.reduce((acc, e) => {
          acc[e.event] = (acc[e.event] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log("   Event counts:", eventCounts);
      }
    }

    // 4. Test API endpoints (if running locally)
    console.log("\n4. Testing API endpoints...");
    try {
      const response = await fetch("http://localhost:3000/api/experiments/upgrade_banner");
      if (response.ok) {
        const data = await response.json();
        console.log("✅ API endpoint accessible");
        console.log("   Response:", data);
      } else {
        console.log("❌ API endpoint error:", response.status);
      }
    } catch (error) {
      console.log("⚠️  API endpoint test skipped (server not running)");
    }

    console.log("\n🎉 A/B Testing system test completed!");
    console.log("\nNext steps:");
    console.log("1. Visit a page with the upgrade banner to see variants");
    console.log("2. Check the database for new assignments and events");
    console.log("3. Use the admin interface at /admin/experiments");
    console.log("4. Monitor conversion rates in the weekly report");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testABTesting().catch(console.error); 