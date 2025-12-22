import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const accountId = url.searchParams.get("account_id"); // Optional: pass account_id if updating existing
  
  if (!code) {
    return NextResponse.redirect(new URL("/settings/mailboxes?error=missing_code", req.url));
  }

  try {
    // Exchange code at Google token endpoint
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/gmail/oauth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      return NextResponse.redirect(new URL("/settings/mailboxes?error=token_exchange_failed", req.url));
    }

    const tokenData = await tokenRes.json();
    
    // Get user email from Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL("/settings/mailboxes?error=profile_fetch_failed", req.url));
    }
    
    const profile = await profileRes.json();
    const emailAddress = profile.email as string;

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.redirect(new URL("/settings/mailboxes?error=not_authenticated", req.url));
    }

    // Prepare gmail_tokens object
    const gmailTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expiry_date: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      scope: tokenData.scope || null,
      token_type: tokenData.token_type || "Bearer",
      id_token: tokenData.id_token || null,
    };

    // Find or create connected_accounts entry
    if (accountId) {
      // Update existing account
      const { error: updateError } = await supabase
        .from("connected_accounts")
        .update({ gmail_tokens: gmailTokens })
        .eq("id", accountId)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Failed to update gmail_tokens:", updateError);
        return NextResponse.redirect(new URL("/settings/mailboxes?error=update_failed", req.url));
      }
    } else {
      // Find existing account by email and user_id
      const { data: existingAccount } = await supabase
        .from("connected_accounts")
        .select("id")
        .eq("user_id", user.id)
        .or(`email_address.eq.${emailAddress},email.eq.${emailAddress}`)
        .maybeSingle();

      if (existingAccount) {
        // Update existing
        const { error: updateError } = await supabase
          .from("connected_accounts")
          .update({ gmail_tokens: gmailTokens })
          .eq("id", existingAccount.id);

        if (updateError) {
          console.error("Failed to update gmail_tokens:", updateError);
          return NextResponse.redirect(new URL("/settings/mailboxes?error=update_failed", req.url));
        }
      } else {
        // Create new account (minimal - you may want to add more fields)
        const { error: insertError } = await supabase
          .from("connected_accounts")
          .insert({
            user_id: user.id,
            provider: "gmail",
            email_address: emailAddress,
            gmail_tokens: gmailTokens,
          });

        if (insertError) {
          console.error("Failed to insert connected_account:", insertError);
          return NextResponse.redirect(new URL("/settings/mailboxes?error=insert_failed", req.url));
        }
      }
    }

    return NextResponse.redirect(new URL("/settings/mailboxes?gmail_connected=1", req.url));
  } catch (error: any) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect(new URL(`/settings/mailboxes?error=${encodeURIComponent(error?.message || "unknown_error")}`, req.url));
  }
}



