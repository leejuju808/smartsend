import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const sb = getServiceClient();
  const sp = new URL(req.url).searchParams;
  const a = sp.get("a")!, l = sp.get("l")!;
  const days = Number(sp.get("days") || 30);
  await sb.from("email_prefs")
    .upsert({ account_id: a, lead_id: l, paused_until: new Date(Date.now()+days*86400000) }, { onConflict: "account_id,lead_id" });
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/u/success`);
}

