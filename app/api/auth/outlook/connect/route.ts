import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID!;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET!;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";
  const redirectUri =
    process.env.OUTLOOK_REDIRECT_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`
      : "https://app.smartsend.ai/api/auth/outlook/callback");

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Outlook OAuth not configured" }, { status: 500 });
  }

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read openid",
    prompt: "consent",
  }).toString()}`;

  return NextResponse.json({ url: authUrl });
}


































































