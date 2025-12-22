import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { workspaceId, kind, delta = 1 } = await req.json();

    if (!workspaceId || !kind) {
      return NextResponse.json(
        { error: "workspaceId and kind are required" },
        { status: 400 }
      );
    }

    if (!["leads", "campaigns", "sequences"].includes(kind)) {
      return NextResponse.json(
        { error: "kind must be 'leads', 'campaigns', or 'sequences'" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("check_workspace_limit", {
      workspace_id_input: workspaceId,
      kind,
      delta,
    });

    if (error) {
      console.error("Limit check error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    console.error("Limit check exception:", e);
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}








