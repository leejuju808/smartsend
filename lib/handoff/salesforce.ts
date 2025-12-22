// Salesforce Integration
// Pushes hot leads to Salesforce as opportunities

import type { HandoffPayload, HandoffResult } from './types';

export async function pushToSalesforce(payload: HandoffPayload): Promise<HandoffResult> {
  const accessToken = Deno.env.get('SALESFORCE_ACCESS_TOKEN') || process.env.SALESFORCE_ACCESS_TOKEN;
  const instanceUrl = Deno.env.get('SALESFORCE_INSTANCE_URL') || process.env.SALESFORCE_INSTANCE_URL;
  
  if (!accessToken || !instanceUrl) {
    return {
      status: 'failed',
      message: 'SALESFORCE_ACCESS_TOKEN and SALESFORCE_INSTANCE_URL must be configured'
    };
  }

  try {
    // Create or update lead
    let leadId: string | null = null;
    if (payload.lead_email) {
      try {
        // Try to find existing lead
        const searchResponse = await fetch(
          `${instanceUrl}/services/data/v57.0/query?q=SELECT Id FROM Lead WHERE Email = '${encodeURIComponent(payload.lead_email)}'`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.records && searchData.records.length > 0) {
            leadId = searchData.records[0].Id;
          }
        }

        // Create lead if not found
        if (!leadId) {
          const leadResponse = await fetch(
            `${instanceUrl}/services/data/v57.0/sobjects/Lead/`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                FirstName: payload.lead_name.split(' ')[0] || payload.lead_name,
                LastName: payload.lead_name.split(' ').slice(1).join(' ') || '',
                Email: payload.lead_email,
                Company: payload.company || 'Unknown',
                Description: generateDealNote(payload)
              })
            }
          );

          if (leadResponse.ok) {
            const leadData = await leadResponse.json();
            leadId = leadData.id;
          }
        }
      } catch (leadError) {
        console.warn('Failed to create/find Salesforce lead:', leadError);
      }
    }

    // Create opportunity
    const oppResponse = await fetch(
      `${instanceUrl}/services/data/v57.0/sobjects/Opportunity/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Name: `${payload.lead_name} — SmartSend`,
          Amount: (payload.opportunity || 0) * 100,
          StageName: 'Prospecting',
          CloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          Description: generateDealNote(payload),
          LeadSource: 'SmartSend'
        })
      }
    );

    if (!oppResponse.ok) {
      const errorData = await oppResponse.json().catch(() => ({}));
      return {
        status: 'failed',
        message: `Salesforce API error: ${errorData.message || oppResponse.statusText}`,
        data: errorData
      };
    }

    const oppData = await oppResponse.json();

    return {
      status: 'success',
      message: 'Lead pushed to Salesforce successfully',
      data: { opportunity_id: oppData.id, lead_id: leadId }
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to push to Salesforce',
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












