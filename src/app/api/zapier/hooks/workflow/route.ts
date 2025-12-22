import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Zapier webhook endpoint for workflow events
 * Triggers when an OpsGrid workflow completes
 */

export async function POST(req: NextRequest) {
  try {
    const workflow = await req.json();

    // Validate required fields
    if (!workflow || !workflow.id) {
      return NextResponse.json(
        { error: "Invalid workflow data. ID is required." },
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
            event: "workflow_completed",
            data: workflow,
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
    console.error("Error in Zapier workflow webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
