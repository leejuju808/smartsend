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
  const level = (sp.get("level") || "normal") as "low"|"normal"|"high"|"none";
  await sb.from("email_prefs").upsert({ account_id: a, lead_id: l, frequency: level }, { onConflict: "account_id,lead_id" });
  if (level === "none") await sb.rpc("apply_unsubscribe", { p_account_id: a, p_lead_id: l, p_reason: "frequency_none" });
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/u/success`);
}

