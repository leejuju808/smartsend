import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { encrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // workspace_id if passed
  
  if (!code) return new NextResponse("no code", { status: 400 });

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI!
  );

  let tokens;
  try {
    const { tokens: t } = await oauth2.getToken(code);
    tokens = t;
    oauth2.setCredentials(tokens);
  } catch (e: any) {
    return new NextResponse(`Token exchange failed: ${e.message}`, { status: 400 });
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  let email: string;
  try {
    const me = await gmail.users.getProfile({ userId: "me" });
    email = me.data.emailAddress!;
  } catch (e: any) {
    return new NextResponse(`Failed to get profile: ${e.message}`, { status: 400 });
  }

  // Get workspace_id from state or current user's workspace
  let workspace_id: string | null = state || null;
  if (!workspace_id) {
    workspace_id = await getCurrentWorkspaceId();
  }

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

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const token_expiry = tokens.expiry_date 
    ? new Date(tokens.expiry_date).toISOString() 
    : null;

  // Save to connected_accounts (new system)
  const { error: connErr } = await supa.from("connected_accounts").upsert({
    workspace_id,
    provider: "gmail",
    email,
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || "",
    token_expiry: token_expiry,
  }, { 
    onConflict: "workspace_id,provider,email",
    ignoreDuplicates: false 
  });

  if (connErr) {
    return new NextResponse(connErr.message, { status: 500 });
  }

  // Also save to sender_profiles for backward compatibility (if needed)
  const supaUser = createSupabaseClient();
  const { data: { user } } = await supaUser.auth.getUser();
  if (user) {
    const now = new Date();
    const exp = tokens.expiry_date 
      ? new Date(tokens.expiry_date) 
      : new Date(now.getTime() + (tokens.expiry_date ? 0 : 3600) * 1000);
    
    await supabaseAdmin.from("sender_profiles").insert({
      user_id: user.id,
      provider: "gmail",
      email: email,
      display_name: null,
      access_token: encrypt(tokens.access_token!),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expires_at: exp.toISOString(),
      provider_meta: { scope: tokens.scope }
    }).catch(() => {
      // Ignore errors for backward compatibility
    });
  }

  return NextResponse.redirect(new URL("/settings/integrations?connected=gmail", req.url));
}

