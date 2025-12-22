import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // workspace_id

  if (!code) {
    return NextResponse.redirect("/settings/integrations?error=no_code");
  }

  if (!state) {
    return NextResponse.redirect("/settings/integrations?error=no_workspace");
  }

  const workspaceId = state;

  const redirectPath = "/api/calendar/google/callback";
  const redirectUri = new URL(
    redirectPath,
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).toString();

  // 1) Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    return NextResponse.redirect(`/settings/integrations?error=token_exchange_failed&details=${encodeURIComponent(error)}`);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;
  const refreshToken = tokenJson.refresh_token as string | undefined;
  const expiresIn = tokenJson.expires_in as number;
  const expiryIso = new Date(Date.now() + (expiresIn ?? 0) * 1000).toISOString();

  // 2) Identify user (Supabase session)
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.redirect("/auth?error=not_logged_in");
  }

  // 3) Get email from Google
  const profileRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    return NextResponse.redirect("/settings/integrations?error=profile_failed");
  }
  const profile = await profileRes.json();
  const email = profile.email as string;

  // 4) Get list of calendars and use primary/default
  let calendarId = "primary";
  try {
    const calendarsRes = await fetch(CALENDAR_LIST_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (calendarsRes.ok) {
      const calendars = await calendarsRes.json();
      const primaryCalendar = calendars.items?.find((cal: any) => cal.primary === true);
      if (primaryCalendar) {
        calendarId = primaryCalendar.id;
      }
    }
  } catch (error) {
    // Use default 'primary' if calendar list fetch fails
    console.error("Failed to fetch calendar list:", error);
  }

  // 5) Check for existing connection
  const { data: existing } = await supabase
    .from("calendar_connections")
    .select("refresh_token")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .eq("provider", "google")
    .maybeSingle();

  // Use existing refresh token if new one not provided
  const rtToSave = refreshToken ?? existing?.refresh_token;
  if (!rtToSave) {
    return NextResponse.redirect("/settings/integrations?error=no_refresh_token");
  }

  // 6) Upsert calendar connection
  const { error: upsertErr } = await supabase.from("calendar_connections").upsert(
    {
      workspace_id: workspaceId,
      user_id: user.id,
      provider: "google",
      account_email: email,
      access_token: accessToken,
      refresh_token: rtToSave,
      expires_at: expiryIso,
      calendar_id: calendarId,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "workspace_id,user_id,provider",
    }
  );

  if (upsertErr) {
    console.error("Failed to upsert calendar connection:", upsertErr);
    return NextResponse.redirect("/settings/integrations?error=db_upsert_failed");
  }

  return NextResponse.redirect("/settings/integrations?connected=google_calendar");
}








