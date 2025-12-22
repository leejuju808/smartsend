export async function upsertHubspotContact(token: string, email: string, props: Record<string, any>) {
  try {
    // First try to update existing contact
    const updateResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ properties: props })
    });

    if (updateResponse.ok) {
      return { success: true, action: "updated" };
    }

    // If update fails, create new contact
    const createResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ properties: { email, ...props } })
    });

    if (createResponse.ok) {
      return { success: true, action: "created" };
    }

    throw new Error(`HubSpot API error: ${createResponse.status} ${createResponse.statusText}`);
  } catch (error) {
    console.error("Error upserting HubSpot contact:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function createHubspotDeal(token: string, dealData: {
  dealname: string;
  amount?: string;
  pipeline: string;
  dealstage: string;
  email?: string;
  [key: string]: any;
}) {
  try {
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ properties: dealData })
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return { success: true, dealId: result.id };
  } catch (error) {
    console.error("Error creating HubSpot deal:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function logHubspotActivity(token: string, activityData: {
  hs_timestamp: string;
  hs_note_body: string;
  hs_attachment_ids?: string[];
  [key: string]: any;
}) {
  try {
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ properties: activityData })
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error logging HubSpot activity:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function getHubspotContact(token: string, email: string) {
  try {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${token}` 
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: true, contact: null };
      }
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
    }

    const contact = await response.json();
    return { success: true, contact };
  } catch (error) {
    console.error("Error getting HubSpot contact:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
} 