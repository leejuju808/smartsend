import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("ss_owner_authority_events")
      .select("id, event_type, message, created_at, meta")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        line: row
          ? {
              id: String((row as any).id),
              type: String((row as any).event_type),
              message: String((row as any).message),
              created_at: String((row as any).created_at),
              meta: (row as any).meta ?? {},
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}




