import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { renderTemplate, buildLeadContext } from "@/src/lib/template";

export const runtime = "nodejs";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { leadId, campaignId } = await req.json();
    if (!leadId || !campaignId) {
      return NextResponse.json(
        { error: "leadId and campaignId required" },
        { status: 400 }
      );
    }

    const { data: lead, error: e1 } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, title, website, phone, linkedin, custom")
      .eq("id", leadId)
      .single();
    if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

    const { data: camp, error: e2 } = await supabase
      .from("campaigns")
      .select("id, name, from_name, from_email, template_id")
      .eq("id", campaignId)
      .single();
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

    const ctx = await buildLeadContext(lead, camp as any);

    let subject = `Quick question for ${lead.company ?? lead.first_name ?? lead.email}`;
    let body = `Hi ${lead.first_name ?? "there"},\n\nWe built SmartSend to book more meetings from cold email with less effort.\n\n— ${camp.from_name ?? "SmartSend"}`;

    if ((camp as any)?.template_id) {
      const { data: t } = await supabase
        .from("templates")
        .select("subject, body")
        .eq("id", (camp as any).template_id)
        .single();
      if (t) {
        subject = renderTemplate(t.subject || "", ctx);
        body = renderTemplate(t.body || "", ctx);
      }
    }

    return NextResponse.json({ subject, body });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}


