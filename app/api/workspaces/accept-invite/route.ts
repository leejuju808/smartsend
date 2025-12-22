import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: inv } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .maybeSingle();

    if (!inv) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });

    await supabase.from("workspace_members").upsert({
      workspace_id: (inv as any).workspace_id,
      user_id: user.id,
      role: (inv as any).role,
    });

    await supabase
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", (inv as any).id);

    return NextResponse.json({ ok: true, workspace_id: (inv as any).workspace_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}


