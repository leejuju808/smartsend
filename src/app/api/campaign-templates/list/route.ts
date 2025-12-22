import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  try {
    const { campaignId, activeOnly = true } = await req.json();
    
    if (!campaignId) {
      throw new Error("campaignId required");
    }
    
    let q = supabaseAdmin
      .from("campaign_email_templates")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    
    if (activeOnly) {
      q = q.eq("is_active", true);
    }
    
    const { data, error } = await q;
    
    if (error) throw error;
    
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    console.error("Error listing campaign templates:", e);
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
