import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const templateId = params.id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json();
  const instructions: string | undefined = body.instructions;
  const tone: string = body.tone || "neutral";
  const length: "short" | "medium" | "long" = body.length || "medium";
  const variants: number =
    typeof body.variants === "number" && body.variants > 0
      ? Math.min(body.variants, 5)
      : 3;

  // 1) Find workspace for user
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  // Fallback to workspace_members if team_members doesn't exist
  let workspaceId: string | null = null;
  if (memErr || !membership) {
    const { data: wsMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (wsMembership) {
      workspaceId = wsMembership.workspace_id;
    }
  } else {
    workspaceId = membership.workspace_id;
  }

  if (!workspaceId) {
    return Response.json({ error: "no_workspace" }, { status: 403 });
  }

  // 2) Load template (enforce workspace)
  const { data: template, error: tplErr } = await supabase
    .from("templates")
    .select("id, workspace_id, name, body")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .single();

  if (tplErr || !template) {
    return Response.json({ error: "template_not_found" }, { status: 404 });
  }

  // 3) Build system prompt
  const lengthGuidance =
    length === "short"
      ? "Make the rewritten versions concise and to the point. Aim for fewer sentences where possible."
      : length === "long"
      ? "Feel free to expand slightly with more detail and clarity, but keep it punchy and appropriate for a cold email."
      : "Keep roughly the same length as the original.";

  const userInstructions = instructions?.trim()
    ? `Additional instructions from the user: ${instructions.trim()}`
    : "No extra instructions beyond tone and clarity.";

  const prompt = `
You are rewriting a B2B cold email template.

Constraints:
- Keep the core *offer* and *facts* the same.
- You may adjust hooks, sentence structure, and phrasing.
- Preserve any {{merge_tags}} and {{variables}} exactly as written.
- Do NOT invent fake company names or numbers.
- Tone should be: ${tone}.
- ${lengthGuidance}
- ${userInstructions}

Return ${variants} clearly separated variations.
`;

  // 4) Call OpenAI
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert B2B cold email copywriter. You rewrite emails for sales teams while preserving merge tags exactly.",
        },
        {
          role: "user",
          content: prompt + "\n\nOriginal template:\n\n" + template.body,
        },
      ],
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content || "";

    // simple splitter: assume model separates with "Variant X" or "---"
    const splits = raw
      .split(/(?:^|\n)Variant\s+\d+[:\-]?|\n-{3,}\n/gi)
      .map((s) => s.trim())
      .filter(Boolean);

    const result = splits.length ? splits : [raw.trim()];

    const variantsPayload = result.slice(0, variants).map((text, idx) => ({
      id: `variant-${idx + 1}`,
      text,
    }));

    return Response.json(
      {
        templateId: template.id,
        variants: variantsPayload,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Template rewrite error:", err);
    return Response.json(
      { error: "openai_error", message: err?.message },
      { status: 500 }
    );
  }
}

