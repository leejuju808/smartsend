import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?err=auth", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/hubspot/callback`,
    scope: "oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.tasks.write crm.schemas.custom.read crm.objects.activities.write",
    response_type: "code"
  });

  return NextResponse.redirect(
    `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  );
} 