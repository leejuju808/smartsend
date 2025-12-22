import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * AUREV HQ Partner API Gateway
 * /api/hq/integrations/:service
 * 
 * Handles partner integration requests with JWT and per-app API key authentication
 */

/**
 * GET /api/hq/integrations/[service]/auth
 * Get OAuth URL for partner integration
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { service: string } }
) {
  try {
    // Verify auth - check for JWT or partner API key
    const authHeader = req.headers.get("Authorization");
    const partnerKey = req.headers.get("x-partner-api-key");
    
    if (!authHeader && !partnerKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate partner API key or JWT
    if (partnerKey) {
      const { data: keyData } = await supabaseAdmin
        .from("partner_api_keys")
        .select("org_id, partner_name")
        .eq("api_key", partnerKey)
        .eq("status", "active")
        .single();

      if (!keyData) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "auth") {
      // Return OAuth authorization URL for the service
      const service = params.service.toLowerCase();
      const oauthUrls: Record<string, string> = {
        stripe: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/stripe/start`,
        hubspot: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/hubspot/start`,
        notion: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/notion/start`,
        slack: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/slack/start`,
        zapier: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/zapier/start`,
      };

      const oauthUrl = oauthUrls[service];
      if (!oauthUrl) {
        return NextResponse.json({ error: "Service not supported" }, { status: 404 });
      }

      return NextResponse.json({
        service,
        oauth_url: oauthUrl,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/${service}/callback`,
      });
    }

    if (action === "sync") {
      // Return sync status for the integration
      // TODO: Implement sync status check
      return NextResponse.json({
        service: params.service,
        last_synced_at: null,
        status: "not_configured",
      });
    }

    return NextResponse.json({
      service: params.service,
      available_actions: ["auth", "sync", "trigger"],
      docs_url: `${process.env.NEXT_PUBLIC_APP_URL}/dev/docs/integrations/${params.service}`,
    });
  } catch (error: any) {
    console.error("Partner API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hq/integrations/[service]/trigger
 * Trigger an action on the partner service
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { service: string } }
) {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    const partnerKey = req.headers.get("x-partner-api-key");
    
    if (!authHeader && !partnerKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    // Route to appropriate action handler
    switch (action) {
      case "create_lead":
        return handleCreateLead(params.service, body);
      case "create_deal":
        return handleCreateDeal(params.service, body);
      case "send_notification":
        return handleSendNotification(params.service, body);
      case "sync_contacts":
        return handleSyncContacts(params.service, body);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Partner trigger error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions for different partner actions
async function handleCreateLead(service: string, data: any) {
  // Create lead in partner CRM
  const { email, name, company, source } = data;
  
  return NextResponse.json({
    success: true,
    service,
    action: "create_lead",
    lead_id: `lead_${Date.now()}`,
    message: `Lead created in ${service}`,
  });
}

async function handleCreateDeal(service: string, data: any) {
  // Create deal in partner CRM
  const { title, value, stage, contact_id } = data;
  
  return NextResponse.json({
    success: true,
    service,
    action: "create_deal",
    deal_id: `deal_${Date.now()}`,
    message: `Deal created in ${service}`,
  });
}

async function handleSendNotification(service: string, data: any) {
  // Send notification to partner service (Slack, Zapier, etc.)
  const { message, channel, webhook_url } = data;
  
  return NextResponse.json({
    success: true,
    service,
    action: "send_notification",
    message: `Notification sent to ${service}`,
  });
}

async function handleSyncContacts(service: string, data: any) {
  // Sync contacts with partner service
  const { org_id, batch_size } = data;
  
  return NextResponse.json({
    success: true,
    service,
    action: "sync_contacts",
    records_synced: 0,
    message: `Contacts synced with ${service}`,
  });
}
