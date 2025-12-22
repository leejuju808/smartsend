// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// API Route: Get Homeowners List
// Returns list of homeowners with their referral and review stats

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
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

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    // Get homeowners with lead info
    const { data: homeowners, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select(`
        *,
        lead:leads(id, email, first_name, last_name, phone)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (homeownerError) {
      console.error("Error fetching homeowners:", homeownerError);
      return NextResponse.json(
        { error: homeownerError.message },
        { status: 500 }
      );
    }

    // Get count
    const { count, error: countError } = await supabase
      .from("homeowner_profiles")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    return NextResponse.json({
      ok: true,
      homeowners: homeowners || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Error fetching homeowners:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch homeowners" },
      { status: 500 }
    );
  }
}


































