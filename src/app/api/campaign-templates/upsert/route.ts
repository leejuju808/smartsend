import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      id, 
      campaignId, 
      name, 
      variant = "A", 
      weight = 100, 
      subject, 
      body_text, 
      body_html, 
      is_active = true 
    } = body;
    
    if (!campaignId || !name || !subject) {
      throw new Error("campaignId, name, and subject are required");
    }

    const row = { 
      id, 
      campaign_id: campaignId, 
      name, 
      variant, 
      weight, 
      subject, 
      body_text, 
      body_html, 
      is_active, 
      updated_at: new Date().toISOString() 
    };
    
    const { data, error } = await supabaseAdmin
      .from("campaign_email_templates")
      .upsert(row)
      .select("*")
      .limit(1)
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({ ok: true, template: data });
  } catch (e: any) {
    console.error("Error upserting campaign template:", e);
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
