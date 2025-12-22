import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    // Authenticated user via cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .single();
    if (error || !invite) throw new Error("Invalid or expired invite");

    // Upsert membership
    await supabase.from("workspace_members").upsert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: invite.role
    });

    // Mark invite as accepted (one-time use)
    await supabase.from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ ok: true, workspaceId: invite.workspace_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
