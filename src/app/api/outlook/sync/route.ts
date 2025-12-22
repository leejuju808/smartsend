import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: orgRow } = await supabase.rpc("get_primary_org_for_user");
  const org_id = orgRow?.org_id;

  if (!org_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  const { data: acct } = await supabase.from("outlook_accounts").select("*").eq("org_id", org_id).single();
  if (!acct) {
    return NextResponse.json({ error: "outlook not connected" }, { status: 400 });
  }

  // Call the Edge Function to trigger sync
  const funcUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/outlook-sync`;
  const cronSecret = process.env.CRON_SECRET;

  const response = await fetch(funcUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cronSecret}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: "Sync failed", details: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Sync triggered successfully" });
}

