import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Call the Gmail poller Edge Function to trigger sync
  const funcUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gmail-poller`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(funcUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: "Sync failed", details: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Sync triggered successfully" });
}
