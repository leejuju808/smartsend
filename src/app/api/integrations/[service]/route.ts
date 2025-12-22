import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/integrations/[service]
 * Get integration connection status for a workspace
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { service: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Find integration
    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("service_name", params.service)
      .eq("is_active", true)
      .single();

    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Check if connected
    const { data: token } = await supabaseAdmin
      .from("integration_tokens")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integration.id)
      .eq("is_active", true)
      .maybeSingle();

    return NextResponse.json({
      integration: {
        id: integration.id,
        service_name: integration.service_name,
        display_name: integration.display_name,
        category: integration.category,
        icon_url: integration.icon_url,
      },
      connected: !!token,
      token_expires_at: token?.token_expires_at || null,
      last_synced_at: token?.last_synced_at || null,
    });
  } catch (error: any) {
    console.error("Integration fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integrations/[service]
 * Connect or update integration token
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { service: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { access_token, refresh_token, token_expires_at, config } =
      await req.json();

    if (!access_token) {
      return NextResponse.json(
        { error: "access_token required" },
        { status: 400 }
      );
    }

    // Find integration
    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("service_name", params.service)
      .eq("is_active", true)
      .single();

    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Upsert token
    const { data: token, error } = await supabaseAdmin
      .from("integration_tokens")
      .upsert(
        {
          workspace_id: workspaceId,
          integration_id: integration.id,
          access_token,
          refresh_token: refresh_token || null,
          token_expires_at: token_expires_at || null,
          config: config || {},
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "workspace_id,integration_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving integration token:", error);
      return NextResponse.json(
        { error: "Failed to save token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      integration_token_id: token.id,
    });
  } catch (error: any) {
    console.error("Integration connect error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

