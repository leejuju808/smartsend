import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processBatchCompletions, createBatchPrompts } from "@/lib/ai-batch-processor";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // needs insert across RLS (server-only)
);

async function draftForLead(lead: any, campaign: any) {
  const context = `
You are SmartSend, writing a first cold email draft (no fluff).
Company: ${lead.company ?? "unknown"}
Recipient: ${lead.first_name ?? ""} ${lead.last_name ?? ""}
Title: ${lead.title ?? ""}
Website: ${lead.website ?? ""}
Notes: ${lead.notes ?? ""}

Campaign:
- Name: ${campaign.name}
- Offer: ${campaign.offer ?? ""}
- Value Prop: ${campaign.value_prop ?? ""}
- CTA: ${campaign.cta ?? "Reply to book a quick 10-min call."}
- From Company: ${campaign.from_company ?? "SmartSend AI"}

Rules:
- 70–120 words max body.
- 1 crisp subject (≤6 words), no emojis.
- Personalized first line referencing their role/company (but keep it grounded—no fake familiarity).
- Single CTA line. No multiple links; at most one URL if provided.
- Use plain text, short sentences, line breaks between paragraphs.
`;

  const prompt = [
    {
      role: "system",
      content: "You produce concise, high-conversion cold email drafts."
    },
    { role: "user", content: context },
    {
      role: "user",
      content:
        "Return JSON with keys: subject (string), body_markdown (string). No extra text."
    }
  ];

  // Use batch processor for better performance tracking
  const results = await processBatchCompletions([
    {
      prompts: prompt,
      model: "gpt-4o-mini",
      temperature: 0.7,
      parallel_tool_calls: true,
    },
  ]);

  const result = results[0];
  if (!result.success || !result.content) {
    throw new Error(result.error || "Failed to generate draft");
  }

  let parsed = { subject: "Quick idea for you", body_markdown: "" };
  try {
    parsed = JSON.parse(result.content);
  } catch {
    // fallback: if it's not valid JSON, put the whole thing in body
    parsed.body_markdown = String(result.content ?? "").trim();
  }

  return {
    subject: parsed.subject?.slice(0, 120) ?? "A quick idea",
    body_markdown: parsed.body_markdown?.trim() ?? ""
  };
}

export async function POST(req: NextRequest) {
  try {
    const { campaignId, limit = 25 } = await req.json();

    // 1) get campaign + leads (owned by user via service key)
    const {
      data: campaign,
      error: campErr
    } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
    if (campErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .limit(limit);

    if (leadsErr) throw leadsErr;

    // 2) generate drafts using batch processing for better performance
    // Create batch prompts for all leads
    const batchRequests = createBatchPrompts(leads, (lead) => {
      const context = `
You are SmartSend, writing a first cold email draft (no fluff).
Company: ${lead.company ?? "unknown"}
Recipient: ${lead.first_name ?? ""} ${lead.last_name ?? ""}
Title: ${lead.title ?? ""}
Website: ${lead.website ?? ""}
Notes: ${lead.notes ?? ""}

Campaign:
- Name: ${campaign.name}
- Offer: ${campaign.offer ?? ""}
- Value Prop: ${campaign.value_prop ?? ""}
- CTA: ${campaign.cta ?? "Reply to book a quick 10-min call."}
- From Company: ${campaign.from_company ?? "SmartSend AI"}

Rules:
- 70–120 words max body.
- 1 crisp subject (≤6 words), no emojis.
- Personalized first line referencing their role/company (but keep it grounded—no fake familiarity).
- Single CTA line. No multiple links; at most one URL if provided.
- Use plain text, short sentences, line breaks between paragraphs.
Return JSON with keys: subject (string), body_markdown (string). No extra text.`;

      return [
        { role: "system", content: "You produce concise, high-conversion cold email drafts." },
        { role: "user", content: context },
      ];
    });

    // Process all in parallel
    const aiResults = await processBatchCompletions(batchRequests);

    // Save results to database
    const chunks = leads.map(async (lead, index) => {
      const aiResult = aiResults[index];
      
      if (!aiResult.success || !aiResult.content) {
        throw new Error(`Failed to generate draft for lead ${lead.id}: ${aiResult.error}`);
      }

      let parsed = { subject: "Quick idea for you", body_markdown: "" };
      try {
        parsed = JSON.parse(aiResult.content);
      } catch {
        parsed.body_markdown = String(aiResult.content ?? "").trim();
      }

      const { error: insErr } = await supabase.from("email_drafts").insert({
        user_id: campaign.user_id,
        campaign_id: campaignId,
        lead_id: lead.id,
        subject: parsed.subject?.slice(0, 120) ?? "A quick idea",
        body_markdown: parsed.body_markdown?.trim() ?? "",
        model: "gpt-4o-mini",
        temperature: 0.7,
        status: "draft"
      });
      if (insErr) throw insErr;

      return { lead_id: lead.id };
    });

    const results = await Promise.all(chunks);
    return NextResponse.json({ ok: true, created: results.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}