import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * POST /api/revenue/recalculate
 * Block 14400: Recalculates revenue estimates for a contact or entire workspace
 * 
 * Body: {
 *   contact_id?: string (optional - if provided, only recalculate this contact)
 *   workspace_id?: string (optional - if provided, recalculate all contacts in workspace)
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { contact_id, workspace_id } = body;

  try {
    if (contact_id) {
      // Recalculate single contact
      const { data, error } = await supabase.rpc('calculate_contact_revenue', {
        p_contact_id: contact_id
      });

      if (error) {
        console.error("Error recalculating revenue for contact:", error);
        return NextResponse.json(
          { error: "Failed to recalculate revenue", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        contact_id,
        result: data
      });
    } else {
      // Recalculate entire workspace
      const targetWorkspaceId = workspace_id || workspaceId;
      
      const { data, error } = await supabase.rpc('recalculate_workspace_revenue', {
        p_workspace_id: targetWorkspaceId
      });

      if (error) {
        console.error("Error recalculating workspace revenue:", error);
        return NextResponse.json(
          { error: "Failed to recalculate workspace revenue", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        workspace_id: targetWorkspaceId,
        contacts_processed: data
      });
    }
  } catch (error: any) {
    console.error("Revenue recalculation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to recalculate revenue" },
      { status: 500 }
    );
  }
}





















































