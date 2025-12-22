// PipeDrive Integration
// Pushes hot leads to PipeDrive as deals

import type { HandoffPayload, HandoffResult } from './types';

export async function pushToPipeDrive(payload: HandoffPayload): Promise<HandoffResult> {
  const apiToken = Deno.env.get('PIPEDRIVE_API_KEY') || process.env.PIPEDRIVE_API_KEY;
  
  if (!apiToken) {
    return {
      status: 'failed',
      message: 'PIPEDRIVE_API_KEY not configured'
    };
  }

  try {
    // Create deal in PipeDrive
    const dealResponse = await fetch(
      `https://api.pipedrive.com/v1/deals?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${payload.lead_name} — SmartSend`,
          value: (payload.opportunity || 0) * 100, // score → deal value
          currency: 'USD',
          status: 'open',
          visible_to: 3, // Everyone
          note: generateDealNote(payload)
        })
      }
    );

    if (!dealResponse.ok) {
      const errorData = await dealResponse.json().catch(() => ({}));
      return {
        status: 'failed',
        message: `PipeDrive API error: ${errorData.error || dealResponse.statusText}`,
        data: errorData
      };
    }

    const dealData = await dealResponse.json();
    
    // Try to create or find person
    if (payload.lead_email) {
      try {
        const personResponse = await fetch(
          `https://api.pipedrive.com/v1/persons?api_token=${apiToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: payload.lead_name,
              email: [{ value: payload.lead_email, primary: true }],
              org_name: payload.company || undefined
            })
          }
        );

        if (personResponse.ok) {
          const personData = await personResponse.json();
          // Link person to deal
          if (personData.data?.id && dealData.data?.id) {
            await fetch(
              `https://api.pipedrive.com/v1/deals/${dealData.data.id}?api_token=${apiToken}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  person_id: personData.data.id
                })
              }
            );
          }
        }
      } catch (personError) {
        // Person creation is optional, continue even if it fails
        console.warn('Failed to create PipeDrive person:', personError);
      }
    }

    return {
      status: 'success',
      message: 'Lead pushed to PipeDrive successfully',
      data: { deal_id: dealData.data?.id }
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to push to PipeDrive',
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












