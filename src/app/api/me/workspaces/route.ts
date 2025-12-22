// app/api/me/workspaces/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces!inner(id, name, created_at)")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const items = (data || []).map((r: any) => ({
      id: r.workspaces.id,
      name: r.workspaces.name,
      role: r.role,
      created_at: r.workspaces.created_at,
    }));

    // Get active workspace from cookie
    const cookieStore = await cookies();
    const active = cookieStore.get("ws")?.value || items[0]?.id || null;

    return NextResponse.json({ items, active });
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
