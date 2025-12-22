import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`/dashboard/settings/integrations?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect("/dashboard/settings/integrations?error=missing_code");
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect("/auth/signin");
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.text();
      console.error("LinkedIn token exchange failed:", errorData);
      return NextResponse.redirect("/dashboard/settings/integrations?error=token_exchange_failed");
    }

    const token = await tokenRes.json();

    // Get user's org_id/workspace_id
    // Try workspace_members first (matches integrations table structure)
    let orgId: string | null = null;
    
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (workspaceMember?.workspace_id) {
      orgId = workspaceMember.workspace_id;
    } else {
      // Fallback: try profiles.org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      
      if (profile?.org_id) {
        orgId = profile.org_id;
      }
    }

    if (!orgId) {
      return NextResponse.redirect("/dashboard/settings/integrations?error=no_organization");
    }

    // Calculate expiration
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString(); // Default 1 hour

    // Store in integrations table
    // First try to find existing integration
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("org_id", orgId)
      .eq("channel", "linkedin")
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: token.access_token,
          expires_at: expiresAt,
          config: {
            refresh_token: token.refresh_token || null,
            token_type: token.token_type || "Bearer",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Error updating LinkedIn integration:", updateError);
        return NextResponse.redirect("/dashboard/settings/integrations?error=storage_failed");
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from("integrations")
        .insert({
          org_id: orgId,
          type: "linkedin",
          channel: "linkedin",
          access_token: token.access_token,
          expires_at: expiresAt,
          config: {
            refresh_token: token.refresh_token || null,
            token_type: token.token_type || "Bearer",
          },
        });

      if (insertError) {
        console.error("Error storing LinkedIn integration:", insertError);
        return NextResponse.redirect("/dashboard/settings/integrations?error=storage_failed");
      }
    }

    return NextResponse.redirect("/dashboard/settings/integrations?connected=linkedin");
  } catch (error) {
    console.error("LinkedIn OAuth error:", error);
    return NextResponse.redirect(
      `/dashboard/settings/integrations?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Unknown error"
      )}`
    );
  }
}

