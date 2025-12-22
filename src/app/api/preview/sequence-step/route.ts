import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { renderTemplate } from "@/lib/templating";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLeadContext } from "@/lib/renderContext";

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id, subject, body } = await req.json();
  if (!subject || !body) return NextResponse.json({ error: "subject & body required" }, { status: 400 });

  let ctx: any = {};
  if (lead_id) {
    ctx = await getLeadContext(lead_id);
  } else {
    // load any one lead of the user for demo preview
    const { data: lead } = await supabaseAdmin
      .from("leads").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ctx = lead ? await getLeadContext(lead.id) : { lead: {}, custom: {} };
  }

  const subj = renderTemplate(subject, ctx);
  const bodyR = renderTemplate(body, ctx);

  return NextResponse.json({ subject: subj, body: bodyR });
}