// HubSpot Integration
// Pushes hot leads to HubSpot as deals

import type { HandoffPayload, HandoffResult } from './types';

export async function pushToHubSpot(payload: HandoffPayload): Promise<HandoffResult> {
  const apiKey = Deno.env.get('HUBSPOT_API_KEY') || process.env.HUBSPOT_API_KEY;
  
  if (!apiKey) {
    return {
      status: 'failed',
      message: 'HUBSPOT_API_KEY not configured'
    };
  }

  try {
    // Create or update contact
    let contactId: string | null = null;
    if (payload.lead_email) {
      try {
        const contactResponse = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts?hapikey=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              properties: {
                email: payload.lead_email,
                firstname: payload.lead_name.split(' ')[0] || payload.lead_name,
                lastname: payload.lead_name.split(' ').slice(1).join(' ') || '',
                company: payload.company || ''
              }
            })
          }
        );

        if (contactResponse.ok) {
          const contactData = await contactResponse.json();
          contactId = contactData.id;
        } else {
          // Try to find existing contact
          const searchResponse = await fetch(
            `https://api.hubapi.com/crm/v3/objects/contacts/${payload.lead_email}?idProperty=email&hapikey=${apiKey}`
          );
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            contactId = searchData.id;
          }
        }
      } catch (contactError) {
        console.warn('Failed to create/find HubSpot contact:', contactError);
      }
    }

    // Create deal
    const dealResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals?hapikey=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: {
            dealname: `${payload.lead_name} — SmartSend`,
            amount: String((payload.opportunity || 0) * 100),
            dealstage: 'appointmentscheduled',
            pipeline: 'default',
            closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            notes: generateDealNote(payload)
          },
          associations: contactId ? [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] // Contact to Deal
          }] : []
        })
      }
    );

    if (!dealResponse.ok) {
      const errorData = await dealResponse.json().catch(() => ({}));
      return {
        status: 'failed',
        message: `HubSpot API error: ${errorData.message || dealResponse.statusText}`,
        data: errorData
      };
    }

    const dealData = await dealResponse.json();

    return {
      status: 'success',
      message: 'Lead pushed to HubSpot successfully',
      data: { deal_id: dealData.id, contact_id: contactId }
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to push to HubSpot',
      data: { error: String(error) }
    };
  }
}

function generateDealNote(payload: HandoffPayload): string {
  const parts: string[] = [];
  
  if (payload.summary) {
    parts.push(`Summary: ${payload.summary}`);
  }
  
  if (payload.tone) {
    parts.push(`Tone: ${payload.tone}`);
  }
  
  if (payload.opportunity !== undefined) {
    parts.push(`Opportunity Score: ${payload.opportunity}/10`);
  }
  
  if (payload.buyer_role) {
    parts.push(`Buyer Role: ${payload.buyer_role}`);
  }
  
  if (payload.objections && payload.objections.length > 0) {
    parts.push(`Objections: ${JSON.stringify(payload.objections)}`);
  }
  
  parts.push(`\nSource: SmartSend Campaign`);
  if (payload.lead_email) {
    parts.push(`Email: ${payload.lead_email}`);
  }
  
  return parts.join('\n');
}












