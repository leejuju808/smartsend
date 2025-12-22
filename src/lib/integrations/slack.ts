export async function postToSlack(webhookUrl: string, text: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error posting to Slack:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function postToSlackWithAttachments(webhookUrl: string, text: string, attachments: any[]) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text,
        attachments 
      })
    });
    
    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error posting to Slack with attachments:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export function formatSlackMessage(event: string, email: string, campaign_id?: string, additionalData?: any): string {
  const emoji = getEventEmoji(event);
  let message = `${emoji} **${event.toUpperCase()}** from ${email}`;
  
  if (campaign_id) {
    message += ` in campaign ${campaign_id}`;
  }
  
  if (additionalData?.lead_score) {
    message += ` (Lead Score: ${additionalData.lead_score})`;
  }
  
  if (additionalData?.meeting_booked) {
    message += ` 📅 Meeting booked!`;
  }
  
  return message;
}

function getEventEmoji(event: string): string {
  switch (event.toLowerCase()) {
    case "reply": return "📨";
    case "open": return "👁️";
    case "click": return "🔗";
    case "bounce": return "❌";
    case "unsubscribe": return "🚫";
    case "meeting_booked": return "📅";
    case "lead_score_updated": return "📊";
    case "sequence_enrolled": return "🔄";
    case "campaign_sent": return "📤";
    default: return "📧";
  }
} 