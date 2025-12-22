import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/authApiKey";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const keyCache = new Map();
    if (keyCache.has(ip) && Date.now() - keyCache.get(ip) < 1000)
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    keyCache.set(ip, Date.now());

    const key = req.headers.get("authorization")?.replace("Bearer ", "");
    const workspace_id = await verifyApiKey(key!);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from("sequence_metrics")
      .select("name, sent, opened, clicked, open_rate, click_rate")
      .limit(10);

    if (error) throw new Error(error.message);
    return NextResponse.json({ workspace_id, metrics: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}