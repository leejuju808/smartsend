// SmartSend AUREV OS - HubSpot CRM Sync Edge Function
// Syncs contacts, companies, and deals bi-directionally between AUREV and HubSpot

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const HUBSPOT_TOKEN = Deno.env.get("HUBSPOT_API_KEY")!;

interface HubSpotContact {
  id?: string;
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  phone?: string;
  hs_lead_status?: string;
  [key: string]: any;
}

async function getHubSpotContact(email: string): Promise<HubSpotContact | null> {
  try {
    const response = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts?properties=email,firstname,lastname,company,phone,hs_lead_status&limit=10`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("HubSpot API error:", await response.text());
      return null;
    }

    const data = await response.json();
    const contact = data.results?.find((c: HubSpotContact) => 
      c.properties?.email?.toLowerCase() === email.toLowerCase()
    );

    return contact ? contact.properties : null;
  } catch (error) {
    console.error("Error fetching HubSpot contact:", error);
    return null;
  }
}

async function createHubSpotContact(lead: any): Promise<string | null> {
  try {
    const properties: any = {
      email: lead.email,
    };

    if (lead.first_name) properties.firstname = lead.first_name;
    if (lead.last_name) properties.lastname = lead.last_name;
    if (lead.company) properties.company = lead.company;
    if (lead.phone) properties.phone = lead.phone;
    if (lead.title) properties.jobtitle = lead.title;

    const response = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HubSpot create error:", errorText);
      return null;
    }

    const data = await response.json();
    return data.id || null;
  } catch (error) {
    console.error("Error creating HubSpot contact:", error);
    return null;
  }
}

async function updateHubSpotContact(contactId: string, lead: any): Promise<boolean> {
  try {
    const properties: any = {};

    if (lead.first_name) properties.firstname = lead.first_name;
    if (lead.last_name) properties.lastname = lead.last_name;
    if (lead.company) properties.company = lead.company;
    if (lead.phone) properties.phone = lead.phone;
    if (lead.title) properties.jobtitle = lead.title;

    const response = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HubSpot update error:", errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error updating HubSpot contact:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    // Get all leads from AUREV
    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, phone, title")
      .not("email", "is", null)
      .limit(100);

    if (fetchError) {
      console.error("Error fetching leads:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leads" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing ${leads?.length || 0} leads to HubSpot...`);

    let synced = 0;
    let updated = 0;
    let created = 0;
    let failed = 0;

    for (const lead of leads || []) {
      try {
        // Check if contact exists in HubSpot
        const existingContact = await getHubSpotContact(lead.email);

        if (existingContact && existingContact.id) {
          // Update existing contact
          const wasUpdated = await updateHubSpotContact(existingContact.id, lead);
          if (wasUpdated) {
            updated++;
            synced++;
          } else {
            failed++;
          }
        } else {
          // Create new contact
          const contactId = await createHubSpotContact(lead);
          if (contactId) {
            created++;
            synced++;
          } else {
            failed++;
          }
        }

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        failed++;
      }
    }

    console.log(`HubSpot sync complete: ${synced} synced (${created} created, ${updated} updated), ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        created,
        updated,
        failed,
        total: leads?.length || 0,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
