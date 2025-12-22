// Unified Handoff Engine
// Routes handoffs to appropriate CRM or notification system

import type { HandoffPayload, HandoffResult } from './types';
import { pushToPipeDrive } from './pipedrive';
import { pushToHubSpot } from './hubspot';
import { pushToSalesforce } from './salesforce';
import { emailSalesTeam } from './email';
import { slackNotify } from './slack';
import { discordNotify } from './discord';

export async function initiateHandoff(
  payload: HandoffPayload,
  destination: string
): Promise<HandoffResult> {
  if (!destination || destination === 'none') {
    return { status: 'ignored', message: 'No handoff destination configured' };
  }

  try {
    switch (destination) {
      case 'pipedrive':
        return await pushToPipeDrive(payload);
      case 'hubspot':
        return await pushToHubSpot(payload);
      case 'salesforce':
        return await pushToSalesforce(payload);
      case 'email':
        return await emailSalesTeam(payload);
      case 'slack':
        return await slackNotify(payload);
      case 'discord':
        return await discordNotify(payload);
      default:
        return { status: 'ignored', message: `Unknown destination: ${destination}` };
    }
  } catch (error: any) {
    console.error(`Handoff failed for ${destination}:`, error);
    return {
      status: 'failed',
      message: error?.message || 'Unknown error',
      data: { error: String(error) }
    };
  }
}












