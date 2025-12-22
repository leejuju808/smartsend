import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Label = "positive" | "negative" | "neutral" | "question" | "unsubscribe" | "bounce" | "oof";

const PROMPTS: Record<Label, string[]> = {
  unsubscribe: [
    "Write a terse corporate-style unsubscribe without the word 'unsubscribe'. Include \"please take me off your list\".",
    "Write a legal-sounding opt-out referencing privacy without saying unsubscribe.",
  ],
  oof: [
    "Write an Out of Office with dates and a delegate line. Vary phrasing from 'automatic reply'.",
    "OOO message in British English, includes bank holiday mention.",
  ],
  bounce: [
    "Simulate an SMTP delivery failure with realistic 550/5.1.1 text and mail headers fragment.",
    "Write a 'Mailbox full' NDR variant with 552 code.",
  ],
  question: [
    "A prospect asks 2 short questions about pricing and onboarding; ends with a question mark.",
    "A one-liner question asking for a calendar link, informal tone.",
  ],
  positive: [
    "A concise 'interested, let's chat' reply proposing two time windows.",
    "Excited tone, asks for demo this week, mentions team.",
  ],
  negative: [
    "Polite decline citing existing vendor; includes 'not a fit now'.",
    "Firm no with 'please stop' but not an unsubscribe.",
  ],
  neutral: [
    "Administrative reply acknowledging receipt with 'thanks'.",
    "Forwarded thread noise with minimal signal; contains signature block.",
  ],
};

serve(async (req) => {
  const s = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      global: {
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
      },
    },
  );

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const { per_label = 20, temperature = 0.7 } = await req.json().catch(() => ({}));

  const rows: any[] = [];
  for (const label of Object.keys(PROMPTS) as Label[]) {
    const targets = PROMPTS[label];
    for (let i = 0; i < per_label; i++) {
      const seed = targets[i % targets.length];
      const text = synth(seed, temperature);
      rows.push({
        source_sample_id: null,
        message_id: null,
        label,
        text,
        engine: "synthetic-hard",
        prompt: seed,
        temperature,
        meta: { variant: "programmed" },
      });
    }
  }

  if (rows.length) {
    const { error } = await s.from("ai_paraphrases").insert(rows);
    if (error) return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true, created: rows.length });
});

function synth(prompt: string, _temp: number) {
  const stamps = ["- Sent from my mobile", "- Regards,", "- Best,", "- Thank you,", "", ""];
  const add = stamps[Math.floor(Math.random() * stamps.length)];
  return `${prompt}\n\n${add}`;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

