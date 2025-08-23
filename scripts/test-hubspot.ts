import { createClient } from "@supabase/supabase-js";
import { getHubspotAuth, findHubspotContact, createHubspotNote } from "../src/lib/hubspot";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testHubspotIntegration() {
  console.log("Testing HubSpot integration...");

  try {
    // Test 1: Check if any teams have HubSpot tokens
    const { data: tokens } = await supabase
      .from("hubspot_tokens")
      .select("team_id, portal_id")
      .limit(5);

    if (!tokens || tokens.length === 0) {
      console.log("❌ No teams with HubSpot integration found");
      console.log("To test, first connect a team to HubSpot via the OAuth flow");
      return;
    }

    console.log(`✅ Found ${tokens.length} teams with HubSpot integration`);
    
    // Test 2: Test authentication for first team
    const firstTeam = tokens[0];
    console.log(`\nTesting authentication for team ${firstTeam.team_id}...`);
    
    const auth = await getHubspotAuth(firstTeam.team_id);
    if (!auth) {
      console.log("❌ Failed to get HubSpot auth for team");
      return;
    }

    console.log(`✅ Successfully authenticated with HubSpot (Portal: ${auth.portalId})`);

    // Test 3: Test contact search
    console.log("\nTesting contact search...");
    const testEmail = "test@example.com";
    const contactId = await findHubspotContact(auth.token, testEmail);
    
    if (contactId) {
      console.log(`✅ Found contact with ID: ${contactId}`);
      
      // Test 4: Test note creation
      console.log("\nTesting note creation...");
      const noteCreated = await createHubspotNote(
        auth.token,
        contactId,
        "Test Subject",
        "This is a test note from SmartSendAI integration test script.",
        "https://smartsend.ai"
      );
      
      if (noteCreated) {
        console.log("✅ Successfully created HubSpot note");
      } else {
        console.log("❌ Failed to create HubSpot note");
      }
    } else {
      console.log(`ℹ️  No contact found for ${testEmail} (this is expected for test email)`);
    }

    // Test 5: Test with a real contact if available
    console.log("\nTesting with real contacts...");
    const { data: contacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("user_team_id", firstTeam.team_id)
      .limit(1);

    if (contacts && contacts.length > 0) {
      const realEmail = contacts[0].email;
      console.log(`Testing with real contact: ${realEmail}`);
      
      const realContactId = await findHubspotContact(auth.token, realEmail);
      if (realContactId) {
        console.log(`✅ Found real contact with ID: ${realContactId}`);
        
        const realNoteCreated = await createHubspotNote(
          auth.token,
          realContactId,
          "SmartSendAI Test Note",
          "This note was created during integration testing. It includes a link back to SmartSendAI and demonstrates the integration is working correctly.",
          "https://smartsend.ai"
        );
        
        if (realNoteCreated) {
          console.log("✅ Successfully created note for real contact");
        } else {
          console.log("❌ Failed to create note for real contact");
        }
      } else {
        console.log(`ℹ️  Real contact ${realEmail} not found in HubSpot (may need to sync first)`);
      }
    }

    console.log("\n🎉 HubSpot integration test completed!");
    
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the test
testHubspotIntegration().catch(console.error); 