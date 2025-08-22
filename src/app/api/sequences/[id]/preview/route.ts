import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/server/supabase";
import { renderTemplate, hasUnresolvedTokens } from "@/src/lib/templating";

function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { step_no, lead_id } = await req.json().catch(()=> ({}));
  if (!step_no || !lead_id) return NextResponse.json({ error: "Missing step_no/lead_id" }, { status: 400 });

  const [{ data: step }, { data: lead }, { data: mb }, { data: prof }] = await Promise.all([
    supabaseAdmin.from("sequence_steps").select("subject,body").eq("sequence_id", params.id).eq("step_no", step_no).single(),
    supabaseAdmin.from("leads").select("email,name,company,custom1,custom2,custom3").eq("id", lead_id).single(),
    supabaseAdmin.from("mailboxes").select("from_email,from_name").eq("owner", userId).maybeSingle(),
    supabaseAdmin.from("profiles").select("tz").eq("id", userId).maybeSingle()
  ]);
  if (!step || !lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ctx = {
    lead,
    sender: { name: mb?.from_name || "", email: mb?.from_email || "" },
    todayISO: new Date().toISOString(),
  };

  const renderedSubject = renderTemplate(step.subject, ctx, { html: false });
  const renderedBody = renderTemplate(step.body, ctx, { html: true });

  return NextResponse.json({
    subject: renderedSubject,
    body: renderedBody,
    unresolved: hasUnresolvedTokens(renderedSubject) || hasUnresolvedTokens(renderedBody)
  });
}

