import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new NextResponse("no code", { status: 400 });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID!}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MS_REDIRECT_URI!,
    }),
  });
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number; id_token?: string;
  };
  if (!tokens.access_token) return new NextResponse("token error", { status: 400 });

  // get user email
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const me = await meRes.json() as { userPrincipalName?: string; mail?: string; };

  const email = me.mail || me.userPrincipalName!;
  const token_expiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  // Get workspace_id
  let workspace_id = await getCurrentWorkspaceId();

  // Fallback: get from user's workspace
  if (!workspace_id) {
    const supa = createSupabaseClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.redirect("/login");
    
    // Get first workspace for user
    const { data: ws } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    
    workspace_id = ws?.workspace_id || null;
  }

  if (!workspace_id) {
    return new NextResponse("No workspace found", { status: 400 });
  }

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supa.from("connected_accounts").upsert({
    workspace_id,
    provider: "outlook",
    email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry
  }, { onConflict: "workspace_id,provider,email" });

  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.redirect(new URL("/settings/integrations?connected=outlook", req.url));
}

