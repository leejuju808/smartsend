import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("v_fn_health_24h").select("*");

  if (error) {
    console.error("v_fn_health_24h query failed", error);
    return NextResponse.json({ error: "Failed to load health metrics" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}







