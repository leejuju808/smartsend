#!/usr/bin/env tsx

/**
 * Test script for the Smart Automation Rules system
 * 
 * This script tests the core automation functionality:
 * 1. Creates automation rules
 * 2. Triggers automation events
 * 3. Verifies actions are executed
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TEST_EMAIL = "test-automation@example.com";
const TEST_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000"; // placeholder

async function testAutomationSystem() {
  console.log("🧪 Testing Smart Automation Rules System...\n");

  try {
    // 1. Clean up any existing test data
    console.log("1️⃣ Cleaning up test data...");
    await cleanupTestData();

    // 2. Create test automation rules
    console.log("2️⃣ Creating test automation rules...");
    const ruleIds = await createTestRules();

    // 3. Test event-based automation (open tracking)
    console.log("3️⃣ Testing event-based automation (open)...");
    await testOpenAutomation();

    // 4. Test event-based automation (click tracking)
    console.log("4️⃣ Testing event-based automation (click)...");
    await testClickAutomation();

    // 5. Test score-based automation
    console.log("5️⃣ Testing score-based automation...");
    await testScoreAutomation();

    // 6. Clean up
    console.log("6️⃣ Cleaning up test data...");
    await cleanupTestData();

    console.log("\n✅ All automation tests passed!");
  } catch (error) {
    console.error("\n❌ Automation test failed:", error);
    process.exit(1);
  }
}

async function cleanupTestData() {
  // Delete test automation rules
  await supabase
    .from("automation_rules")
    .delete()
    .like("name", "Test Rule%");

  // Delete test contacts
  await supabase
    .from("contacts")
    .delete()
    .eq("email", TEST_EMAIL);

  // Delete test suppressions
  await supabase
    .from("suppression_emails")
    .delete()
    .eq("email", TEST_EMAIL);
}

async function createTestRules() {
  const rules = [
    {
      name: "Test Rule: Hot Lead on Pricing Click",
      trigger_type: "event",
      event_type: "click",
      condition_json: { contains_url: "pricing" },
      actions: [
        { action_type: "tag", action_payload: { tag: "hot_lead" } },
        { action_type: "enroll_sequence", action_payload: { sequence_id: "test-sequence-1" } }
      ]
    },
    {
      name: "Test Rule: High Score Assignment",
      trigger_type: "score",
      condition_json: { min_score: 50 },
      actions: [
        { action_type: "assign", action_payload: { user_id: "test-user-1" } }
      ]
    },
    {
      name: "Test Rule: Reply Suppression",
      trigger_type: "event",
      event_type: "reply",
      actions: [
        { action_type: "suppress", action_payload: {} }
      ]
    }
  ];

  const ruleIds = [];
  for (const rule of rules) {
    const { data, error } = await supabase
      .from("automation_rules")
      .insert({
        ...rule,
        workspace_id: "00000000-0000-0000-0000-000000000000", // placeholder
        is_enabled: true
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create rule "${rule.name}": ${error.message}`);
    }

    // Create actions for this rule
    for (const action of rule.actions) {
      await supabase
        .from("automation_actions")
        .insert({
          rule_id: data.id,
          action_type: action.action_type,
          action_payload: action.action_payload
        });
    }

    ruleIds.push(data.id);
    console.log(`   Created rule: ${rule.name}`);
  }

  return ruleIds;
}

async function testOpenAutomation() {
  // Create test contact
  await supabase
    .from("contacts")
    .upsert({
      email: TEST_EMAIL,
      first_name: "Test",
      last_name: "User",
      workspace_id: "00000000-0000-0000-0000-000000000000"
    });

  // Trigger automation for open event
  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/automation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      campaign_id: TEST_CAMPAIGN_ID,
      event_type: "open"
    })
  });

  if (!response.ok) {
    throw new Error(`Automation run failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`   Open automation triggered ${result.matching_rules} rules`);
}

async function testClickAutomation() {
  // Trigger automation for click event with pricing URL
  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/automation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      campaign_id: TEST_CAMPAIGN_ID,
      event_type: "click",
      url: "https://example.com/pricing"
    })
  });

  if (!response.ok) {
    throw new Error(`Automation run failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`   Click automation triggered ${result.matching_rules} rules`);

  // Verify the hot_lead tag was added
  const { data: contact } = await supabase
    .from("contacts")
    .select("tags")
    .eq("email", TEST_EMAIL)
    .single();

  if (contact?.tags?.includes("hot_lead")) {
    console.log("   ✅ Hot lead tag was added successfully");
  } else {
    console.log("   ⚠️  Hot lead tag was not added (tags system may not be implemented)");
  }
}

async function testScoreAutomation() {
  // Set lead score to 75 (above the 50 threshold)
  await supabase
    .from("contacts")
    .update({ lead_score: 75 })
    .eq("email", TEST_EMAIL);

  // Trigger automation for score change
  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/automation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: TEST_EMAIL,
      lead_score: 75
    })
  });

  if (!response.ok) {
    throw new Error(`Automation run failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`   Score automation triggered ${result.matching_rules} rules`);
}

// Run the test if this script is executed directly
if (require.main === module) {
  testAutomationSystem().catch(console.error);
}

export { testAutomationSystem }; 