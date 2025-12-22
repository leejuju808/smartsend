import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { requireEditor } from "@/lib/permissions/campaign";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: { stepId: string } }
) {
  const supabase = createClient();
  const stepId = params.stepId;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return Response.json({ error: "not_auth" }, { status: 401 });

  const { tone, length, variants, instructions } = await req.json();

  // 1) Load the sequence step + its campaign (for permission check)
  // First get the step
  const { data: step, error: stepErr } = await supabase
    .from("sequence_steps")
    .select(`
      id, 
      campaign_id,
      sequence_id,
      subject,
      subject_template,
      body,
      body_md,
      html_template,
      html_override,
      position,
      step_number
    `)
    .eq("id", stepId)
    .single();

  if (stepErr || !step) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Get campaign_id from step directly or via sequence
  let campaignId = (step as any).campaign_id;
  
  if (!campaignId && (step as any).sequence_id) {
    // Fetch campaign_id from sequence
    const { data: sequence } = await supabase
      .from("sequences")
      .select("campaign_id")
      .eq("id", (step as any).sequence_id)
      .single();
    
    campaignId = sequence?.campaign_id;
  }

  if (!campaignId) {
    return Response.json(
      { error: "no_campaign", message: "Step is not linked to a campaign" },
      { status: 400 }
    );
  }

  // 2) Enforce permissions
  const perm = await requireEditor(campaignId);
  if (!perm.allowed) return perm.response;

  // Extract subject and body (handle different field names)
  const subject = (step as any).subject || (step as any).subject_template || "";
  const body = (step as any).body || (step as any).body_md || (step as any).html_template || (step as any).html_override || "";
  const position = (step as any).position || (step as any).step_number || 1;

  // 3) Build OpenAI prompt
  const lengthMsg =
    length === "short"
      ? "Make it shorter + tighter."
      : length === "long"
      ? "Expand slightly while keeping it a cold email."
      : "Keep roughly the same length.";

  const prompt = `
Rewrite this cold email sequence step.

Rules:
- Preserve all {{merge_tags}} exactly.
- Keep the intention of the step (position ${position}).
- Do NOT change the ask unless improving clarity.
- Tone: ${tone}
- ${lengthMsg}
- Extra instructions: ${instructions || "none"}

Original subject:
${subject || "(none)"}

Original body:
${body}
`;

  // 4) Call OpenAI
  const comp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You are a cold email copywriter rewriting sequence steps while preserving merge tags.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = comp.choices[0].message?.content || "";
  const splits = raw
    .split(/(?:^|\n)Variant\s+\d+[:\-]?|\n-{3,}\n/gi)
    .map((x) => x.trim())
    .filter(Boolean);

  const usable = splits.slice(0, variants || 3);

  const result = usable.map((variant, i) => ({
    id: `variant-${i + 1}`,
    text: variant,
  }));

  return Response.json({ stepId, variants: result });
}

