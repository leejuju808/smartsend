import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/api/mailboxes/google/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: "https://www.googleapis.com/auth/gmail.send openid email profile",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) return new NextResponse("OAuth init failed", { status: 500 });
  return NextResponse.redirect(data.url);
}

