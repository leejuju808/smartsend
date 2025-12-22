import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function callOpenAI(payload: any) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  const content =
    data?.output_text ??
    data?.choices?.[0]?.message?.content ??
    data?.data?.[0]?.content?.[0]?.text;
  return content as string;
}

export async function POST(req: NextRequest) {
  try {
    const { campaignId, leadId } = await req.json();
    if (!campaignId || !leadId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();
    if (lErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const ctx = `
You are SmartSend. Write a concise, high-conversion cold email.

Recipient: ${lead.first_name ?? ""} ${lead.last_name ?? ""} (${lead.title ?? ""})
Company: ${lead.company ?? ""}
Website: ${lead.website ?? ""}
Notes: ${lead.notes ?? ""}

Campaign:
- Name: ${campaign.name}
- Offer: ${campaign.offer ?? ""}
- Value Prop: ${campaign.value_prop ?? ""}
- CTA: ${campaign.cta ?? "Reply to book a 10-min call."}
- From Company: ${campaign.from_company ?? "SmartSend AI"}

Rules:
- ≤120 words, 1 subject (≤6 words), no emojis.
- Personalized first line about role/company (no fake familiarity).
- Plain text with short lines, blank line between paragraphs.

Return JSON: { "subject": string, "body_markdown": string }`;

    const content = await callOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "You produce concise, high-conversion cold email drafts." },
        { role: "user", content: ctx },
      ],
    });

    let parsed = { subject: "Quick idea", body_markdown: String(content).trim() };
    try { parsed = JSON.parse(content); } catch {}

    // Mark old drafts rejected (optional; keep history)
    await supabase
      .from("email_drafts")
      .update({ status: "rejected" })
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .eq("status", "draft");

    const { error: insErr } = await supabase.from("email_drafts").insert({
      user_id: campaign.user_id,
      campaign_id: campaignId,
      lead_id: leadId,
      subject: (parsed.subject ?? "Quick idea").slice(0, 120),
      body_markdown: parsed.body_markdown ?? "",
      model: "gpt-4o-mini",
      temperature: 0.7,
      status: "draft",
    });
    if (insErr) throw insErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}