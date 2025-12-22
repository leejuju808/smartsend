// Block 28060 — Get Homeowner Detail

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    const { id } = await params;

    // Get homeowner with lead info
    const { data: homeowner, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select(`
        *,
        lead:leads(id, email, first_name, last_name, phone)
      `)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (homeownerError || !homeowner) {
      return NextResponse.json(
        { error: "Homeowner not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      homeowner,
    });
  } catch (error: any) {
    console.error("Error fetching homeowner:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch homeowner" },
      { status: 500 }
    );
  }
}


































