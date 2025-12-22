import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { date } = await req.json();
    const targetDate = date || new Date().toISOString().split("T")[0];

    // Invoke the production-daily-briefing edge function
    const { data, error } = await supabase.functions.invoke(
      "production-daily-briefing",
      {
        body: {
          workspace_id: workspaceId,
          date: targetDate,
        },
      }
    );

    if (error) {
      console.error("Error invoking production-daily-briefing:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/production/daily-briefing:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































