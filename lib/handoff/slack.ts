// Slack Notification Integration
// Sends hot lead alerts to Slack channel

import type { HandoffPayload, HandoffResult } from './types';

export async function slackNotify(payload: HandoffPayload): Promise<HandoffResult> {
  const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL') || process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return {
      status: 'failed',
      message: 'SLACK_WEBHOOK_URL not configured'
    };
  }

  try {
    const message = formatSlackMessage(payload);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: 'failed',
        message: `Slack API error: ${errorText || response.statusText}`,
        data: { error: errorText }
      };
    }

    return {
      status: 'success',
      message: 'Slack notification sent successfully'
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to send Slack notification',
      data: { error: String(error) }
    };
  }
}

function formatSlackMessage(payload: HandoffPayload) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔥 HOT LEAD ALERT',
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Lead:*\n${payload.lead_name}`
        },
        {
          type: 'mrkdwn',
          text: `*Email:*\n${payload.lead_email || 'N/A'}`
        }
      ]
    }
  ];

  if (payload.company) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Company:*\n${payload.company}`
        },
        {
          type: 'mrkdwn',
          text: `*Opportunity Score:*\n${payload.opportunity || 0}/10`
        }
      ]
    });
  }

  if (payload.tone) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Tone:*\n${payload.tone}`
        },
        payload.buyer_role ? {
          type: 'mrkdwn',
          text: `*Buyer Role:*\n${payload.buyer_role}`
        } : undefined
      ].filter(Boolean)
    });
  }

  if (payload.summary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:*\n${payload.summary}`
      }
    });
  }

  if (payload.objections && payload.objections.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Objections:*\n${payload.objections.map((o: any) => `• ${typeof o === 'string' ? o : JSON.stringify(o)}`).join('\n')}`
      }
    });
  }

  // Fallback text for notifications
  const text = `🔥 *HOT LEAD ALERT* — ${payload.lead_name}\n\n` +
    `Company: ${payload.company || 'N/A'}\n` +
    `Tone: ${payload.tone || 'N/A'}\n` +
    `Opportunity: ${payload.opportunity || 0}/10\n\n` +
    `Summary:\n${payload.summary || 'N/A'}`;

  return { text, blocks };
}












