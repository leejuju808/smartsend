import { createAdminClient } from "@/lib/supabase";

export async function getHubspotAuth(teamId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("hubspot_tokens")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
  
  if (!data) return null;

  // Check if token expires in more than 1 minute
  if (new Date(data.expires_at) > new Date(Date.now() + 60_000)) {
    return { token: data.access_token, portalId: data.portal_id };
  }

  // Token expired, refresh it
  try {
    const r = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        refresh_token: data.refresh_token
      })
    });
    
    const j = await r.json();
    if (!r.ok) {
      console.error("Failed to refresh HubSpot token:", j);
      return null;
    }

    const expiresAt = new Date(Date.now() + (j.expires_in || 0) * 1000).toISOString();
    await supabase
      .from("hubspot_tokens")
      .update({
        access_token: j.access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq("team_id", teamId);

    return { token: j.access_token, portalId: data.portal_id };
  } catch (error) {
    console.error("Error refreshing HubSpot token:", error);
    return null;
  }
}

export async function createHubspotNote(
  token: string, 
  contactId: string, 
  subject: string, 
  text: string,
  siteUrl: string
) {
  try {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/notes`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `AI reply sent via SmartSendAI.\nSubject: ${subject}\n\nPreview:\n${text.substring(0, 200)}${text.length > 200 ? '...' : ''}\n\nView: ${siteUrl}/dashboard/inbox`
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to create HubSpot note:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error creating HubSpot note:", error);
    return false;
  }
}

export async function findHubspotContact(token: string, email: string) {
  try {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: email
          }]
        }],
        limit: 1
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to search HubSpot contacts:", error);
      return null;
    }

    const data = await response.json();
    return data?.results?.[0]?.id || null;
  } catch (error) {
    console.error("Error searching HubSpot contacts:", error);
    return null;
  }
} 