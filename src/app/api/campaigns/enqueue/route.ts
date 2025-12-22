import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { renderTemplate } from "@/lib/personalize";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { lead_ids, subject_tmpl, text_tmpl, html_tmpl, campaign_id } = await req.json();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id,email,first_name,last_name,company,title,phone,custom")
    .in("id", lead_ids)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const batch = (leads ?? []).map(l => {
    const subject = renderTemplate(subject_tmpl, l);
    const html = html_tmpl ? renderTemplate(html_tmpl, l) : (text_tmpl ? renderTemplate(text_tmpl, l) : "");
    return {
      campaign_id,
      lead_id: l.id,
      to_email: l.email,
      subject,
      body_html: html,
      status: 'queued',
      scheduled_at: new Date().toISOString()
    };
  });

  // chunk insert to send_queue
  const chunk = 1000;
  for (let i=0;i<batch.length;i+=chunk){
    const { error: insErr } = await supabase.from("send_queue").insert(batch.slice(i,i+chunk));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, enqueued: batch.length });
}
