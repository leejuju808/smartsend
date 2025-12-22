import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest, 
  { params }: { params: { id: string }}
) {
  const supabase = supabaseAdmin();
  
  // id format: base64url of JSON {u: url, o: org_id, c: campaign_id, l: lead_id, m: message_uuid}
  try {
    const j = JSON.parse(Buffer.from(params.id, "base64url").toString("utf8"));
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0] || "0.0.0.0";
    const ua = req.headers.get("user-agent") || "";

    // Insert click event
    await supabase.from("click_events").insert({
      org_id: j.o, 
      campaign_id: j.c, 
      lead_id: j.l, 
      message_uuid: j.m, 
      url: j.u, 
      ip, 
      ua
    });

    // Redirect to destination URL
    return NextResponse.redirect(j.u, { status: 302 });
  } catch {
    return NextResponse.redirect("/", { status: 302 });
  }
}

