import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "lib/supabaseAdmin";
import { renderTemplate } from "lib/merge";
import { sendMail } from "lib/replies-mailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { emailId, leadId, subject, bodyHtml, templateId } = await req.json();

    // Fetch lead + original email (for threading + campaign)
    const [{ data: lead }, { data: orig }] = await Promise.all([
      supabaseAdmin.from("leads").select("id,user_id,email,first_name,last_name,company").eq("id", leadId).single(),
      supabaseAdmin.from("emails").select("id,campaign_id,provider_message_id,provider_thread_id,thread_id").eq("id", emailId).single()
    ]);

    if (!lead?.email) return NextResponse.json({ error: "Lead not found" }, { status: 400 });

    // Load optional template + signature + campaign
    const [tplRes, sigRes, campRes] = await Promise.all([
      templateId ? supabaseAdmin.from("reply_templates").select("*").eq("id", templateId).single() : Promise.resolve({ data: null }),
      supabaseAdmin.from("user_signatures").select("html").single(),
      orig?.campaign_id ? supabaseAdmin.from("campaigns").select("id,name").eq("id", orig.campaign_id).single() : Promise.resolve({ data: null })
    ]);
    const signatureHtml = sigRes.data?.html ?? null;
    const baseHtml = tplRes.data?.body_html ?? bodyHtml;
    const finalHtml = renderTemplate(baseHtml, {
      lead,
      campaign: campRes.data || undefined,
      user: {}, 
      signatureHtml
    });

    const finalSubject = (tplRes.data?.subject || subject || "").trim() || "Re:";
    const sendRes = await sendMail({
      to: lead.email,
      subject: finalSubject,
      html: finalHtml,
      threadId: orig?.provider_thread_id ?? null,
      inReplyTo: orig?.provider_message_id ?? null,
      references: orig?.provider_message_id ?? null,
      userId: lead.user_id
    });

    // Persist email row (reply) + event
    const newId = crypto.randomUUID();
    await supabaseAdmin.from("emails").insert({
      id: newId,
      lead_id: lead.id,
      campaign_id: orig?.campaign_id,
      subject: finalSubject,
      body_html: finalHtml,
      status: "sent",
      provider: sendRes.provider,
      provider_message_id: sendRes.providerMessageId,
      provider_thread_id: sendRes.providerThreadId,
      thread_id: orig?.thread_id ?? emailId // chain locally
    });

    await supabaseAdmin.from("email_events").insert({
      email_id: newId,
      lead_id: lead.id,
      campaign_id: orig?.campaign_id,
      event_type: "sent",
      meta: { kind: "reply" }
    });

    return NextResponse.json({ ok: true, emailId: newId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "send failed" }, { status: 500 });
  }
}

