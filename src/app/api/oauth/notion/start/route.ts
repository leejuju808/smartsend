import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
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
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  // Generate state for security
  const state = encodeURIComponent(JSON.stringify({ uid: user.id }));
  
  // Notion OAuth URL
  const params = new URLSearchParams({
    client_id: process.env.NOTION_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/oauth/notion/callback`,
    response_type: "code",
    owner: "user",
  });

  return NextResponse.redirect(
    `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  );
}
