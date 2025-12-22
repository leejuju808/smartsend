import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient();
  // After redirect, Supabase has set the session cookie
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new NextResponse("No session", { status: 401 });

  // Pull tokens (Supabase exposes provider tokens on session)
  const providerToken = (session as any).provider_token as string | undefined;
  const providerRefresh = (session as any).provider_refresh_token as string | undefined;

  // Basic guard: we need a refresh token for long-lived sending
  if (!providerRefresh) {
    return new NextResponse("No refresh token. Reconnect with consent.", { status: 400 });
  }

  const user = session.user;
  const email = user.email ?? (user.user_metadata?.email as string | undefined) ?? null;

  // Create mailbox row
  const { error } = await supabase.from("mailboxes").insert({
    user_id: user.id,
    provider: "gmail",
    email,
    from_email: email,
    display_name: user.user_metadata?.full_name ?? null,
    oauth: {
      provider: "google",
      refresh_token: providerRefresh,
      // You can cache an access token temporarily if present
      access_token: providerToken ?? null,
      scope: "gmail.send",
      obtained_at: new Date().toISOString()
    }
  });

  if (error) return new NextResponse("Failed to save mailbox", { status: 500 });
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/mailboxes`);
}

