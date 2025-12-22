import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);

  const email = payload?.email;
  const leadId = payload?.lead_id;

  if (!email || !leadId) {
    return NextResponse.json({ error: "email and lead_id required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase environment not configured" }, { status: 500 });
  }

  const s = createClient(supabaseUrl, serviceKey);
  const emailNorm = email.trim().toLowerCase();

  const { error } = await s.from("lead_aliases").upsert({ email_norm: emailNorm, lead_id: leadId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


