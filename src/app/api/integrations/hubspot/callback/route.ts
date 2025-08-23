import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?err=auth", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?err=no_code", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  // Find caller's team
  const supabase = createAdminClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  
  if (!prof?.team_id) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?err=no_team", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  // Exchange code for tokens
  try {
    const r = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/hubspot/callback`,
        code
      })
    });

    const j = await r.json();
    if (!r.ok) {
      console.error("HubSpot OAuth error:", j);
      return NextResponse.redirect(
        new URL(`/dashboard/settings?err=hs_${j?.message || "oauth"}`, process.env.NEXT_PUBLIC_SITE_URL)
      );
    }

    const expiresAt = new Date(Date.now() + (j.expires_in || 0) * 1000).toISOString();
    await supabase
      .from("hubspot_tokens")
      .upsert({
        team_id: prof.team_id,
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: expiresAt,
        portal_id: j.hub_id || null,
        updated_at: new Date().toISOString()
      });

    return NextResponse.redirect(
      new URL("/dashboard/settings?hubspot=connected", process.env.NEXT_PUBLIC_SITE_URL)
    );
  } catch (error) {
    console.error("Error during HubSpot OAuth:", error);
    return NextResponse.redirect(
      new URL("/dashboard/settings?err=hs_network", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }
} 