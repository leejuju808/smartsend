import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sender_email = searchParams.get("sender_email");
  if (!sender_email) return NextResponse.json({ error: "sender_email required" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("sender_health_today")
    .select("*")
    .eq("sender_email", sender_email)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row });
}
