import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, email, campaign_id, org_id, ...additionalData } = body;
    
    if (!event || !org_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sb = createAdminClient();
    
    // Get all integrations for this org
    const { data: integrations, error } = await sb
      .from("integrations")
      .select("*")
      .eq("org_id", org_id);

    if (error) {
      console.error("Error fetching integrations:", error);
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
    }

    // Trigger webhooks for each integration
    const webhookPromises = (integrations || []).map(async (integration) => {
      try {
        switch (integration.type) {
          case "zapier":
            const url = integration.config?.url;
            if (url) {
              await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event,
                  email,
                  campaign_id,
                  org_id,
                  integration_id: integration.id,
                  timestamp: new Date().toISOString(),
                  ...additionalData
                })
              });
            }
            break;
            
          case "slack":
            const webhookUrl = integration.config?.webhook_url;
            if (webhookUrl) {
              const message = formatSlackMessage(event, email, campaign_id, additionalData);
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: message })
              });
            }
            break;
            
          case "hubspot":
            // HubSpot integration will be handled separately via the sync-contacts endpoint
            // This is just for webhook notifications
            break;
        }
      } catch (err) {
        console.error(`Error triggering ${integration.type} integration:`, err);
        // Don't fail the entire request if one integration fails
      }
    });

    // Wait for all webhooks to complete (but don't block on failures)
    await Promise.allSettled(webhookPromises);

    return NextResponse.json({ ok: true, integrations_triggered: integrations?.length || 0 });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function formatSlackMessage(event: string, email: string, campaign_id: string, additionalData: any): string {
  const emoji = getEventEmoji(event);
  const baseMessage = `${emoji} **${event.toUpperCase()}** from ${email}`;
  
  if (campaign_id) {
    return `${baseMessage} in campaign ${campaign_id}`;
  }
  
  return baseMessage;
}

function getEventEmoji(event: string): string {
  switch (event.toLowerCase()) {
    case "reply": return "📨";
    case "open": return "👁️";
    case "click": return "🔗";
    case "bounce": return "❌";
    case "unsubscribe": return "🚫";
    case "meeting_booked": return "📅";
    default: return "📧";
  }
} 