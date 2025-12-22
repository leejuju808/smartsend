import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabaseServer";

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?section=sending&error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?section=sending&error=missing_code", req.url)
    );
  }

  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login?redirect=/settings?section=sending", req.url)
      );
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=no_org", req.url)
      );
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin}/api/settings/email/oauth/gmail/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=oauth_not_configured", req.url)
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange error:", tokenData);
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=token_exchange_failed", req.url)
      );
    }

    // Get user info
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=failed_to_fetch_user", req.url)
      );
    }

    const userInfo = await userInfoResponse.json();
    const emailAddress = userInfo.email?.toLowerCase();

    if (!emailAddress) {
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=no_email", req.url)
      );
    }

    // Calculate expiration
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Store in email_credentials table
    const { error: credentialError } = await supabase.from("email_credentials").upsert(
      {
        org_id: orgId,
        provider: "gmail",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        email_address: emailAddress,
        display_name: userInfo.name || null,
        verified: true,
        daily_send_limit: 500,
      },
      { onConflict: "org_id,provider,email_address" }
    );

    if (credentialError) {
      console.error("Error storing credentials:", credentialError);
      return NextResponse.redirect(
        new URL("/settings?section=sending&error=save_failed", req.url)
      );
    }

    return NextResponse.redirect(
      new URL("/settings?section=sending&connected=gmail", req.url)
    );
  } catch (error: any) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(`/settings?section=sending&error=${encodeURIComponent(error.message)}`, req.url)
    );
  }
}





























































