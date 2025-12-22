import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type VariantMode =
  | "improve"
  | "shorter"
  | "more_casual"
  | "more_formal"
  | "warmer"
  | "punchier";

type VariantPayload = {
  subject?: string;
  body?: string;
  mode?: VariantMode;
  count?: number; // default 3
};

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return Response.json(
      { error: "openai_not_configured" },
      { status: 500 }
    );
  }

  const supabase = createClient();

  // Auth
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // (Optional) workspace check
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    // Fallback to workspace_members if team_members doesn't exist
    const { data: wsMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (!wsMembership) {
      console.warn(
        "[templates.variants] no_workspace_for_user",
        user.id,
        memErr
      );
    }
  }

  let bodyJson: VariantPayload;
  try {
    bodyJson = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const subject = bodyJson.subject ?? "";
  const emailBody = bodyJson.body ?? "";
  const mode: VariantMode = bodyJson.mode ?? "improve";
  const count = Math.min(Math.max(bodyJson.count ?? 3, 1), 5); // 1–5

  if (!subject && !emailBody) {
    return Response.json(
      { error: "nothing_to_rewrite" },
      { status: 400 }
    );
  }

  const prompt = buildVariantPrompt(subject, emailBody, mode, count);

  try {
    const completionRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "template_variants",
              schema: {
                type: "object",
                properties: {
                  variants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        subject: { type: "string" },
                        body: { type: "string" },
                      },
                      required: ["subject", "body"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["variants"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            {
              role: "system",
              content:
                "You generate alternate cold email templates for a sales outreach tool. Always obey the instructions and respond with strict JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (!completionRes.ok) {
      const text = await completionRes.text();
      console.error(
        "[templates.variants] OpenAI error",
        completionRes.status,
        text
      );
      return Response.json(
        { error: "openai_error" },
        { status: 500 }
      );
    }

    const json = await completionRes.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return Response.json(
        { error: "no_content_from_openai" },
        { status: 500 }
      );
    }

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (e) {
      console.error("[templates.variants] parse error", e, content);
      return Response.json(
        { error: "parse_error" },
        { status: 500 }
      );
    }

    const variants = Array.isArray(parsed.variants) ? parsed.variants : [];

    return Response.json(
      {
        variants,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[templates.variants] unexpected error", err);
    return Response.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}

function buildVariantPrompt(
  subject: string,
  body: string,
  mode: VariantMode,
  count: number
): string {
  const modeInstruction =
    mode === "shorter"
      ? "Make each variant more concise while keeping all core value props. Remove fluff."
      : mode === "more_casual"
      ? "Use a more casual, friendly tone but still professional."
      : mode === "more_formal"
      ? "Use a more formal, polished tone suitable for executives."
      : mode === "warmer"
      ? "Make the tone warmer and more human, slightly more personal."
      : mode === "punchier"
      ? "Make the subject line punchier and the body more direct and high-impact."
      : "Improve clarity, flow, and impact while keeping length roughly similar.";

  return `
You are generating ${count} alternate versions of a cold email template.

CRITICAL RULES:
- Do NOT change any text inside double curly braces like {{first_name}}, {{company}}, {{job_title}}.
- Do NOT remove or rename these variables.
- Keep the overall intent and offer similar to the original, but allow small positioning or framing changes.
- Use plain text for the body (no HTML).
- Subjects should be short and clear.

Mode: ${mode}
Mode instructions: ${modeInstruction}

Return ONLY JSON of the form:
{
  "variants": [
    { "subject": "...", "body": "..." },
    ...
  ]
}

Original subject:
${subject || "(none)"}

Original body:
${body || "(none)"}
`;
}




