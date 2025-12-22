import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.redirect("/auth/signin");
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Build LinkedIn OAuth URL
  const redirect = new URL("https://www.linkedin.com/oauth/v2/authorization");
  redirect.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    scope: "r_liteprofile r_emailaddress w_member_social",
    state: state,
  }).toString();

  return NextResponse.redirect(redirect.toString());
}

