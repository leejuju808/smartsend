import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?err=auth`);
  
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    scope: "chat:write,channels:read,groups:read,users:read",
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/slack/callback`
  });
  
  return NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
} 