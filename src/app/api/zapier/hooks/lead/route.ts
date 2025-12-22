import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Zapier webhook endpoint for new lead events
 * Triggers when a new SmartSend lead is added
 */

export async function POST(req: NextRequest) {
  try {
    const lead = await req.json();

    // Validate required fields
    if (!lead || !lead.email) {
      return NextResponse.json(
        { error: "Invalid lead data. Email is required." },
        { status: 400 }
      );
    }

    // Get all active Zapier integrations
    const supabase = createAdminClient();
    const { data: integrations, error: integrationError } = await supabase
      .from("integrations")
      .select("config")
      .eq("type", "zapier")
      .eq("enabled", true);

    if (integrationError) {
      console.error("Error fetching Zapier integrations:", integrationError);
      return NextResponse.json(
        { error: "Failed to fetch integrations" },
        { status: 500 }
      );
    }

    // Notify all connected Zaps
    const results = [];
    for (const integration of integrations || []) {
      const webhookUrl = integration.config?.webhook_url;
      if (!webhookUrl) continue;

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "new_lead",
            data: lead,
            timestamp: new Date().toISOString(),
          }),
        });

        results.push({
          webhook_url: webhookUrl,
          success: response.ok,
          status: response.status,
        });
      } catch (error) {
        console.error("Error calling Zapier webhook:", error);
        results.push({
          webhook_url: webhookUrl,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      notified_zaps: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in Zapier lead webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
