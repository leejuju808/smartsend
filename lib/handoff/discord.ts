// Discord Notification Integration
// Sends hot lead alerts to Discord channel

import type { HandoffPayload, HandoffResult } from './types';

export async function discordNotify(payload: HandoffPayload): Promise<HandoffResult> {
  const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL') || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return {
      status: 'failed',
      message: 'DISCORD_WEBHOOK_URL not configured'
    };
  }

  try {
    const embed = formatDiscordEmbed(payload);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: 'failed',
        message: `Discord API error: ${errorText || response.statusText}`,
        data: { error: errorText }
      };
    }

    return {
      status: 'success',
      message: 'Discord notification sent successfully'
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to send Discord notification',
      data: { error: String(error) }
    };
  }
}

function formatDiscordEmbed(payload: HandoffPayload) {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Lead',
      value: payload.lead_name,
      inline: true
    },
    {
      name: 'Email',
      value: payload.lead_email || 'N/A',
      inline: true
    }
  ];

  if (payload.company) {
    fields.push({
      name: 'Company',
      value: payload.company,
      inline: true
    });
  }

  if (payload.opportunity !== undefined) {
    fields.push({
      name: 'Opportunity Score',
      value: `${payload.opportunity}/10`,
      inline: true
    });
  }

  if (payload.tone) {
    fields.push({
      name: 'Tone',
      value: payload.tone,
      inline: true
    });
  }

  if (payload.buyer_role) {
    fields.push({
      name: 'Buyer Role',
      value: payload.buyer_role,
      inline: true
    });
  }

  if (payload.summary) {
    fields.push({
      name: 'Summary',
      value: payload.summary.substring(0, 1024), // Discord field value limit
      inline: false
    });
  }

  if (payload.objections && payload.objections.length > 0) {
    const objectionsText = payload.objections
      .map((o: any) => `• ${typeof o === 'string' ? o : JSON.stringify(o)}`)
      .join('\n')
      .substring(0, 1024);
    
    fields.push({
      name: 'Objections',
      value: objectionsText,
      inline: false
    });
  }

  return {
    title: '🔥 Hot Lead Alert',
    color: 0xff6b6b, // Red color
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'SmartSend AI'
    }
  };
}












