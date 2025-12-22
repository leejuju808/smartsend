import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/hq/integrations/available
 * Get all available integrations and their connection status
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    // Fetch all available integrations
    const { data: allIntegrations, error: integrationsError } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("is_active", true)
      .order("display_name");

    if (integrationsError) {
      console.error("Error fetching integrations:", integrationsError);
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
    }

    // Fetch connected integrations for this org
    const { data: connectedTokens, error: tokensError } = await supabaseAdmin
      .from("integration_tokens")
      .select("integration_id, is_active")
      .eq("workspace_id", org.id)
      .eq("is_active", true);

    if (tokensError) {
      console.error("Error fetching connected integrations:", tokensError);
    }

    // Create a set of connected integration IDs
    const connectedIds = new Set(
      (connectedTokens || []).map((token) => token.integration_id)
    );

    // Merge data
    const integrations = (allIntegrations || []).map((integration) => ({
      ...integration,
      connected: connectedIds.has(integration.id),
    }));

    return NextResponse.json({ integrations });
  } catch (error: any) {
    console.error("Available integrations error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

