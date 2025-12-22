import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ME_URL = "https://graph.microsoft.com/v1.0/me";
const CALENDAR_LIST_URL = "https://graph.microsoft.com/v1.0/me/calendars";

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

  const redirectPath = "/api/calendar/outlook/callback";
  const redirectUri = new URL(
    redirectPath,
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).toString();

  // 1) Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access",
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

  // 3) Get user info from Microsoft Graph
  const meRes = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect("/settings/integrations?error=profile_failed");
  }
  const me = await meRes.json();
  const email = (me.mail || me.userPrincipalName) as string;

  // 4) Get list of calendars and use primary/default
  let calendarId = "primary";
  try {
    const calendarsRes = await fetch(CALENDAR_LIST_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (calendarsRes.ok) {
      const calendars = await calendarsRes.json();
      const primaryCalendar = calendars.value?.find((cal: any) => cal.isDefaultCalendar === true);
      if (primaryCalendar) {
        calendarId = primaryCalendar.id;
      } else if (calendars.value && calendars.value.length > 0) {
        calendarId = calendars.value[0].id;
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
    .eq("provider", "outlook")
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
      provider: "outlook",
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

  return NextResponse.redirect("/settings/integrations?connected=outlook_calendar");
}








