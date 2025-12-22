import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncInvoicesToAccounting, getAccountingSyncConfig } from "@/lib/accounting-sync";

/**
 * GET /api/accounting/sync
 * Get sync configuration
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("team_id");

    if (!teamId) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const config = await getAccountingSyncConfig(supabase, teamId);

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error("Error fetching sync config:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/sync
 * Trigger manual sync or update configuration
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { team_id, action, config, invoice_ids } = body;

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (action === "sync") {
      // Trigger sync
      const result = await syncInvoicesToAccounting(
        supabase,
        team_id,
        invoice_ids
      );

      return NextResponse.json({ result });
    } else if (action === "update_config" && config) {
      // Update configuration
      const { updateAccountingSyncConfig } = await import("@/lib/accounting-sync");
      const success = await updateAccountingSyncConfig(supabase, team_id, config);

      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json(
          { error: "Failed to update configuration" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'sync' or 'update_config'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in sync:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}














