import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const leadId = u.searchParams.get("leadId");
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const supabase = createClient(url, service, { auth: { persistSession: false } });

    const { data: leadRow, error: leadErr } = await supabase
      .from("leads").select("id,email,campaign_id,first_name,last_name,company")
      .eq("id", leadId).single();
    if (leadErr || !leadRow) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { data: inbound, error: inErr } = await supabase
      .from("inbound_messages")
      .select("id,provider,from_email,to_email,subject,body,created_at,thread_id")
      .eq("from_email", leadRow.email)
      .order("created_at", { ascending: true });
    if (inErr) return NextResponse.json({ error: inErr.message }, { status: 500 });

    return NextResponse.json({ lead: leadRow, inbound });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load messages" }, { status: 500 });
  }
}


