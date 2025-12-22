import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { googleAuthUrl } from "@/lib/providers/google/oauth";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = encodeURIComponent(JSON.stringify({ uid: user.id }));
  const url = googleAuthUrl({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URL || `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/gmail/callback`,
    state,
  });
  
  return NextResponse.redirect(url);
}
