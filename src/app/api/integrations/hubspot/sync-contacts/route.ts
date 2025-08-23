import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";
import { getHubspotAuth } from "@/lib/hubspot";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: prof } = await createAdminClient()
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  
  if (!prof?.team_id) {
    return NextResponse.json({ error: "No team found" }, { status: 400 });
  }

  const auth = await getHubspotAuth(prof.team_id);
  if (!auth) {
    return NextResponse.json({ error: "HubSpot not connected" }, { status: 400 });
  }

  try {
    // Pull recent contacts from your app
    const { data: contacts } = await createAdminClient()
      .from("contacts")
      .select("email, first_name, last_name, company")
      .eq("user_team_id", prof.team_id)
      .limit(500);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ ok: true, count: 0, message: "No contacts to sync" });
    }

    let syncedCount = 0;
    let errorCount = 0;

    // Sync contacts to HubSpot (upsert by email)
    for (const contact of contacts) {
      if (!contact.email) continue;

      try {
        // First try to find existing contact
        const searchResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/search`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${auth.token}` 
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: "email",
                operator: "EQ",
                value: contact.email
              }]
            }],
            limit: 1
          })
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const existingContact = searchData?.results?.[0];

          if (existingContact) {
            // Update existing contact
            const updateResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingContact.id}`, {
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
            } else {
              errorCount++;
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
            } else {
              errorCount++;
            }
          }
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error syncing contact ${contact.email}:`, error);
        errorCount++;
      }
    }

    return NextResponse.json({ 
      ok: true, 
      count: syncedCount,
      total: contacts.length,
      errors: errorCount
    });
  } catch (error) {
    console.error("Error during contacts sync:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
} 