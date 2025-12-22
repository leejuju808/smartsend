#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testClickActions() {
  console.log("🧪 Testing Click Actions System...\n");

  try {
    // 1. Create a test campaign
    console.log("1. Creating test campaign...");
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: "test-user-id", // You'll need to replace this with a real user ID
        title: "Test Click Actions Campaign",
        subject: "Test Subject",
        body: "Test body with <a href='https://example.com/pricing'>pricing link</a>",
        status: "draft"
      })
      .select()
      .single();

    if (campaignError) {
      console.error("❌ Error creating campaign:", campaignError);
      return;
    }
    console.log("✅ Campaign created:", campaign.id);

    // 2. Create a click action rule
    console.log("\n2. Creating click action rule...");
    const { data: clickAction, error: actionError } = await supabase
      .from("click_actions")
      .insert({
        campaign_id: campaign.id,
        match_url: "pricing",
        action: "tag",
        value: "hot_lead"
      })
      .select()
      .single();

    if (actionError) {
      console.error("❌ Error creating click action:", actionError);
      return;
    }
    console.log("✅ Click action created:", clickAction.id);

    // 3. Create a test contact
    console.log("\n3. Creating test contact...");
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        user_id: "test-user-id", // Same user ID as campaign
        name: "Test User",
        email: "test@example.com",
        tags: []
      })
      .select()
      .single();

    if (contactError) {
      console.error("❌ Error creating contact:", contactError);
      return;
    }
    console.log("✅ Contact created:", contact.id);

    // 4. Simulate a click event (this would normally happen via the tracking pixel)
    console.log("\n4. Simulating click event...");
    const { error: clickError } = await supabase
      .from("email_events")
      .insert({
        campaign_id: campaign.id,
        recipient_email: "test@example.com",
        type: "click",
        url: "https://example.com/pricing",
        user_agent: "Test User Agent",
        ip: "127.0.0.1"
      });

    if (clickError) {
      console.error("❌ Error creating click event:", clickError);
      return;
    }
    console.log("✅ Click event created");

    // 5. Check if the tag was added to the contact
    console.log("\n5. Checking if tag was added...");
    const { data: updatedContact, error: fetchError } = await supabase
      .from("contacts")
      .select("tags")
      .eq("id", contact.id)
      .single();

    if (fetchError) {
      console.error("❌ Error fetching updated contact:", fetchError);
      return;
    }

    console.log("📊 Contact tags:", updatedContact.tags);
    
    if (updatedContact.tags && updatedContact.tags.includes("hot_lead")) {
      console.log("✅ SUCCESS: Tag 'hot_lead' was automatically added!");
    } else {
      console.log("❌ FAILED: Tag was not added automatically");
    }

    // 6. Clean up test data
    console.log("\n6. Cleaning up test data...");
    await supabase.from("click_actions").delete().eq("id", clickAction.id);
    await supabase.from("email_events").delete().eq("campaign_id", campaign.id);
    await supabase.from("contacts").delete().eq("id", contact.id);
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    console.log("✅ Test data cleaned up");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testClickActions().then(() => {
  console.log("\n🏁 Test completed");
  process.exit(0);
}).catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
}); 