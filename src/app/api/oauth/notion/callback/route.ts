import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
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
  if (!user) return NextResponse.redirect("/login");

  if (!code) {
    return NextResponse.redirect("/integrations?error=notion_no_code");
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/oauth/notion/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Notion OAuth error:", errorText);
      return NextResponse.redirect("/integrations?error=notion_oauth");
    }

    const tokens = await tokenResponse.json();

    // Store tokens in database
    const { error } = await supabase
      .from("integrations")
      .upsert({
        user_id: user.id,
        type: "notion",
        config: {
          access_token: tokens.access_token,
          bot_id: tokens.bot_id,
          workspace_id: tokens.workspace_id,
          workspace_name: tokens.workspace_name,
        },
      }, {
        onConflict: "user_id,type",
      });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.redirect("/integrations?error=notion_db");
    }

    return NextResponse.redirect("/integrations?connected=notion");
  } catch (error) {
    console.error("Error during Notion OAuth:", error);
    return NextResponse.redirect("/integrations?error=notion_network");
  }
}
