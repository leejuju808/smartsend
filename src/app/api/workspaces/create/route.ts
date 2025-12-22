// app/api/workspaces/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert({ name, created_by: user.id })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({ 
        workspace_id: ws.id, 
        user_id: user.id, 
        role: "owner" 
      });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    // Set as current workspace
    const cookieStore = await cookies();
    cookieStore.set("ws", ws.id, { 
      path: "/", 
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    return NextResponse.json({ ok: true, id: ws.id });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}