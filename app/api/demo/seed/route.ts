// app/api/demo/seed/route.ts
// Block 21717 — SmartSend Roofing Follow-Up Brain DEMO MODE v1
// Admin Route: Manually Trigger Demo Mode

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Try to get company_id from user metadata or workspace
  let companyId = user.user_metadata?.company_id;

  // If not in metadata, try to get from workspace
  if (!companyId) {
    // Get user's workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (workspace) {
      // Try to find a company for this workspace
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("workspace_id", workspace.id)
        .limit(1)
        .single();

      if (company) {
        companyId = company.id;
      } else {
        // Use workspace_id as company_id (workspace-scoped demo)
        companyId = workspace.id;
      }
    }
  }

  // If still no company_id, use user.id as fallback
  if (!companyId) {
    companyId = user.id;
  }

  const { error } = await supabase.rpc("seed_demo_follow_up_data", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Error seeding demo data:", error);
    return NextResponse.json(
      { error: "Failed to seed demo data", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, company_id: companyId },
    { status: 200 }
  );
}











































