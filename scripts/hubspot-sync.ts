import { createClient } from "@supabase/supabase-js";
import { getHubspotAuth, findHubspotContact, createHubspotNote } from "../src/lib/hubspot";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncTeamContacts(teamId: string) {
  console.log(`Syncing contacts for team ${teamId}`);
  
  const auth = await getHubspotAuth(teamId);
  if (!auth) {
    console.log(`No HubSpot auth for team ${teamId}`);
    return;
  }

  try {
    // Get contacts from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: contacts } = await supabase
      .from("contacts")
      .select("email, first_name, last_name, company, created_at")
      .eq("user_team_id", teamId)
      .gte("created_at", yesterday.toISOString())
      .limit(100);

    if (!contacts || contacts.length === 0) {
      console.log(`No new contacts for team ${teamId}`);
      return;
    }

    let syncedCount = 0;
    for (const contact of contacts) {
      if (!contact.email) continue;

      try {
        // Find existing contact in HubSpot
        const contactId = await findHubspotContact(auth.token, contact.email);
        
        if (contactId) {
          // Update existing contact
          const updateResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
            method: "PATCH",
            headers: { 
              "Content-Type": "application/json", 
              "Authorization": `Bearer ${auth.token}` 
            },
            body: JSON.stringify({
              properties: {
                firstname: contact.first_name || "",
                lastname: contact.last_name || "",
                company: contact.company || ""
              }
            })
          });

          if (updateResponse.ok) {
            syncedCount++;
          }
        } else {
          // Create new contact
          const createResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json", 
              "Authorization": `Bearer ${auth.token}` 
            },
            body: JSON.stringify({
              properties: {
                email: contact.email,
                firstname: contact.first_name || "",
                lastname: contact.last_name || "",
                company: contact.company || ""
              }
            })
          });

          if (createResponse.ok) {
            syncedCount++;
          }
        }
      } catch (error) {
        console.error(`Error syncing contact ${contact.email}:`, error);
      }
    }

    console.log(`Synced ${syncedCount} contacts for team ${teamId}`);
  } catch (error) {
    console.error(`Error syncing contacts for team ${teamId}:`, error);
  }
}

async function syncTeamActivities(teamId: string) {
  console.log(`Syncing activities for team ${teamId}`);
  
  const auth = await getHubspotAuth(teamId);
  if (!auth) {
    console.log(`No HubSpot auth for team ${teamId}`);
    return;
  }

  try {
    // Get AI replies from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // This would need to be adapted based on your actual email/activity table structure
    // For now, this is a placeholder
    console.log(`Activity sync not yet implemented for team ${teamId}`);
  } catch (error) {
    console.error(`Error syncing activities for team ${teamId}:`, error);
  }
}

async function main() {
  console.log("Starting HubSpot sync...");
  
  try {
    // Get teams with HubSpot tokens
    const { data: tokens } = await supabase
      .from("hubspot_tokens")
      .select("team_id");
    
    if (!tokens || tokens.length === 0) {
      console.log("No teams with HubSpot integration found");
      return;
    }

    console.log(`Found ${tokens.length} teams with HubSpot integration`);

    for (const token of tokens) {
      try {
        await syncTeamContacts(token.team_id);
        await syncTeamActivities(token.team_id);
      } catch (error) {
        console.error(`Error syncing team ${token.team_id}:`, error);
      }
    }

    console.log("HubSpot sync completed");
  } catch (error) {
    console.error("Error during HubSpot sync:", error);
    process.exit(1);
  }
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
}); 