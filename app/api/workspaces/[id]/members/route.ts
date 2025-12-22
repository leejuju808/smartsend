import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ws = params.id;
    const { targetUserId, role } = await req.json();
    if (!targetUserId || !role) return NextResponse.json({ error: "missing fields" }, { status: 400 });

    const { data: me } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", ws)
      .eq("user_id", user.id)
      .maybeSingle();
    const rank = { owner: 4, admin: 3, member: 2, viewer: 1 }[(me as any)?.role ?? "viewer"];
    if (rank < 3) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase
      .from("workspace_members")
      .update({ role })
      .eq("workspace_id", ws)
      .eq("user_id", targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ws = params.id;
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");
    if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const { data: me } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", ws)
      .eq("user_id", user.id)
      .maybeSingle();
    const rank = { owner: 4, admin: 3, member: 2, viewer: 1 }[(me as any)?.role ?? "viewer"];
    if (rank < 3) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", ws)
      .eq("user_id", targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}


