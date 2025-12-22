// app/api/workspaces/invite/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=missing`);
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?next=${encodeURIComponent(req.url)}`);
    }

    // Verify invite is valid and not expired
    const { data: inv, error } = await supabase
      .from("workspace_invites")
      .select("workspace_id, role, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !inv) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=invalid`);
    }

    if (inv.accepted_at) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=used`);
    }

    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=expired`);
    }

    // Upsert member
    const { error: upErr } = await supabase.from("workspace_members").upsert({
      workspace_id: inv.workspace_id, 
      user_id: user.id, 
      role: inv.role
    }, {
      onConflict: 'workspace_id,user_id'
    });

    if (upErr) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=error`);
    }

    // Mark invite as accepted
    await supabase.from("workspace_invites").update({
      accepted_at: new Date().toISOString()
    }).eq("token", token);

    // Set as current workspace
    const cookieStore = await cookies();
    cookieStore.set("ws", inv.workspace_id, { 
      path: "/", 
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?ws=${inv.workspace_id}&invite=ok`);
  } catch (error) {
    console.error("Error accepting invite:", error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?invite=error`);
  }
}
