import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { seal } from "@/lib/secure";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) return NextResponse.redirect("/dashboard/settings?err=missing_code");

    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect("/dashboard/settings?err=unauthorized");
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type":"application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/connect/gmail/callback`,
        grant_type: "authorization_code"
      })
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok) return NextResponse.redirect("/dashboard/settings?err=token");

    // Get user email
    const idInfo = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    }).then(r=>r.json());

    // Store encrypted tokens
    await supabaseAdmin.from("connected_accounts").upsert({
      user_id: user.id,
      provider: "gmail",
      email: idInfo.email,
      access_token: seal(tok.access_token),
      refresh_token: seal(tok.refresh_token || ""),
      expires_at: new Date(Date.now() + tok.expires_in*1000).toISOString(),
      scope: tok.scope,
      provider_account_id: idInfo.sub
    }, { onConflict: "user_id,provider" });

    return NextResponse.redirect("/dashboard/settings?ok=gmail_connected");
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect("/dashboard/settings?err=callback_error");
  }
}

