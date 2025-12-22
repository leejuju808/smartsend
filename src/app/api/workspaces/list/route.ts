// app/api/workspaces/list/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ workspaces: [] });
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces!inner(id, name, created_at)")
      .eq("user_id", user.id)
      .order("created_at", { referencedTable: "workspaces" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const workspaces = (data || []).map((r: any) => ({
      id: r.workspaces.id,
      name: r.workspaces.name,
      role: r.role,
      created_at: r.workspaces.created_at,
    }));

    const cookieStore = await cookies();
    const current = cookieStore.get("ws")?.value || null;

    return NextResponse.json({ workspaces, current });
  } catch (error) {
    console.error("Error listing workspaces:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}