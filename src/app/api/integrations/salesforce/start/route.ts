import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.redirect(new URL("/dashboard/settings?err=auth", process.env.NEXT_PUBLIC_SITE_URL));
  
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/salesforce/callback`,
    scope: "api refresh_token offline_access",
  });
  
  return NextResponse.redirect(
    `${process.env.SALESFORCE_LOGIN_BASE || "https://login.salesforce.com"}/services/oauth2/authorize?${params.toString()}`
  );
} 