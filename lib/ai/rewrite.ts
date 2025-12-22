import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { RewritePresetConfig } from "@/lib/templates/rewrite-schema";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_VARIANTS = 6;

export type RewriteParams = {
  tone?: "casual" | "professional" | "friendly" | "direct" | "playful";
  length?: "short" | "medium" | "long";
  persona?: string;
  cta?: "book_call" | "reply_yes" | "visit_link" | "download" | "custom";
  custom_cta_text?: string;
  variant_count?: number;
  language?: string;
  forbidden_phrases?: string[];
};

const DEFAULT_FORBIDDEN = [
  "100% guaranteed",
  "act now",
  "free!!!",
  "risk-free",
  "no obligation",
  "click here",
];

function clampVariants(n?: number) {
  if (!n) return 3;
  return Math.max(1, Math.min(MAX_VARIANTS, n));
}

export function guardrailClean(html: string, forbiddenExtra?: string[]) {
  const bans = new Set([
    ...DEFAULT_FORBIDDEN,
    ...(forbiddenExtra || []),
  ].map((s) => s.toLowerCase()));
  let cleaned = html.replace(/<\/?script[^>]*>/gi, "");
  cleaned = cleaned.replace(/on\w+="[^"]*"/gi, "");
  cleaned = cleaned.replace(/href="javascript:[^"]*"/gi, "");
  for (const b of bans) {
    cleaned = cleaned.replace(new RegExp(b, "gi"), "");
  }
  return cleaned;
}

export async function rewriteTemplates(args: {
  baseSubject: string;
  baseHtml: string;
  variables: string[];
  verticalHint?: string;
  params: RewriteParams;
}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const variantCount = clampVariants(args.params.variant_count);

  const sys = [
    "You are an email copy editor for cold outreach.",
    "Goal: rewrite subject and body for deliverability and clarity while preserving placeholders exactly.",
    "Placeholders are in double curly braces like {{first_name}} — DO NOT remove or rename them.",
    "Avoid spam trigger phrases; keep one clear CTA.",
    "Respect the requested tone/length/language.",
    "Return JSON only with fields: variants:[{subject, body_html, notes}].",
  ].join(" ");

  const vList = args.variables?.length
    ? args.variables.map((v) => `{{${v}}}`).join(", ")
    : "(none)";

  const content: ChatCompletionMessageParam[] = [
    { role: "system", content: sys },
    {
      role: "user",
      content:
        `Rewrite this cold email.\nPlaceholders: ${vList}\n` +
        `Tone=${args.params.tone || "professional"}, Length=${args.params.length || "short"}, CTA=${args.params.cta || "reply_yes"}, Language=${args.params.language || "en"}.\n` +
        `Return exactly ${variantCount} distinct variants.\n` +
        `Base Subject: ${args.baseSubject}\n` +
        `Base HTML: ${args.baseHtml}`,
    },
  ];

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: content,
    temperature: 0.7,
    max_tokens: 900,
    response_format: { type: "json_object" },
  });

  const raw = resp.choices?.[0]?.message?.content || "{}";
  let parsed: { variants?: Array<{ subject?: string; body_html?: string; notes?: string }> } = {};
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = { variants: [] };
  }

  const forbidden = args.params.forbidden_phrases || [];
  const variants = (parsed.variants || [])
    .slice(0, variantCount)
    .map((v, i) => {
      const subj = (v.subject || "").trim();
      let body = (v.body_html || "").trim();

      for (const ph of args.variables || []) {
        const needle = `{{${ph}}}`;
        if (!body.includes(needle)) {
          body += `<p>— {{sender_name}} from {{sender_company}}</p>`;
          break;
        }
      }

      body = guardrailClean(body, forbidden);

      return {
        subject: subj,
        body_html: body,
        notes:
          v.notes || `v${i + 1} ${args.params.tone || "professional"} ${args.params.length || "short"}`,
      };
    });

  return { variants, raw };
}

// Block 143 — Smart Template Rewriter v1
// New function for preset-based rewriting
export async function rewriteWithPreset(
  original: string,
  preset: RewritePresetConfig
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const pieces: string[] = [];

  pieces.push(`You are SmartSend's Smart Template Rewriter.`);
  pieces.push(`Your job is to rewrite B2B cold email copy.`);
  pieces.push(`Mode: ${preset.mode}`);
  pieces.push(`Tone: ${preset.tone}`);
  if (preset.max_words) {
    pieces.push(`Target max words: ${preset.max_words}.`);
  }
  pieces.push(`Custom instructions: ${preset.instructions}`);
  pieces.push(`Rules:`);
  pieces.push(`- Keep meaning intact.`);
  pieces.push(`- Preserve important details like names, numbers, and links.`);
  pieces.push(`- Do NOT add fake numbers or promises.`);
  pieces.push(`- Output only the rewritten text, no commentary.`);

  const systemPrompt = pieces.join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Rewrite this email:\n\n"""${original}"""`,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const out = completion.choices[0]?.message?.content ?? "";
  return out.trim();
}
