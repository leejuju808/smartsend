import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const inboxId = params.id;

    // Fetch detailed inbox inspector report
    const { data: report, error: reportError } = await supabase
      .from("inbox_inspector_reports")
      .select(`
        *,
        sender_inboxes!inner(
          id,
          email,
          workspace_id,
          sender_domains!inner(
            id,
            domain,
            created_at
          )
        )
      `)
      .eq("inbox_id", inboxId)
      .single();

    if (reportError) {
      console.error("Error fetching report:", reportError);
      return NextResponse.json(
        { error: reportError.message },
        { status: 500 }
      );
    }

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: ws, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", report.sender_inboxes.workspace_id)
      .single();

    if (wsError || !ws) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Fetch fixes for this inbox
    const { data: fixes, error: fixesError } = await supabase
      .from("inspector_fixes")
      .select("*")
      .eq("inbox_id", inboxId)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });

    if (fixesError) {
      console.error("Error fetching fixes:", fixesError);
    }

    return NextResponse.json({
      report,
      fixes: fixes || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/inspector/inboxes/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



