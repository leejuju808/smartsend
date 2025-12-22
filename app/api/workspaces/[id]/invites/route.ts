import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "node:crypto";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    const { email, role = "member" } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    // Verify requester is admin+
    const { data: me } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", ws)
      .eq("user_id", user.id)
      .maybeSingle();
    const rank = { owner: 4, admin: 3, member: 2, viewer: 1 }[(me as any)?.role ?? "viewer"];
    if (rank < 3) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const token = crypto.randomBytes(24).toString("hex");

    const { data, error } = await supabase
      .from("workspace_invites")
      .insert({
        workspace_id: ws,
        email: String(email).toLowerCase(),
        role: role,
        token
      })
      .select("id, token")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    const link = `${base}/accept-invite?token=${data?.token}`;
    return NextResponse.json({ inviteLink: link });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}


