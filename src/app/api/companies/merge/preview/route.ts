import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const primaryCompanyId = searchParams.get("primary_company_id");
  const mergedCompanyId = searchParams.get("merged_company_id");

  if (!primaryCompanyId || !mergedCompanyId) {
    return NextResponse.json(
      { error: "primary_company_id and merged_company_id are required" },
      { status: 400 }
    );
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  try {
    const { data: preview, error } = await supabase.rpc(
      "get_company_merge_preview",
      {
        p_primary_company_id: primaryCompanyId,
        p_merged_company_id: mergedCompanyId,
      }
    );

    if (error) {
      console.error("Error getting merge preview:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ preview });
  } catch (error: any) {
    console.error("Error in merge preview:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get merge preview" },
      { status: 500 }
    );
  }
}








