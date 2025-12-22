// supabase/functions/reply-intent-classifier/index.ts

// Edge function: classify reply intents (hot / warm / not_interested)
// and refresh reply_intents_summary for each workspace.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "https://esm.sh/openai@4.58.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

// Types
type Intent = "hot" | "warm" | "not_interested";

type ReplyRecord = {
  id: string;
  workspace_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
};

type ClassifierInput = {
  reply_ids: string[]; // array of reply IDs to classify
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed, use POST" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body = (await req.json()) as ClassifierInput;

    if (!body.reply_ids || !Array.isArray(body.reply_ids) || body.reply_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty reply_ids array" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 1) Load replies from DB
    const { data: replies, error: fetchError } = await supabaseAdmin
      .from("email_replies")
      .select(
        `
        id,
        workspace_id,
        from_email,
        from_name,
        subject,
        preview,
        received_at
      `
      )
      .in("id", body.reply_ids);

    if (fetchError) {
      console.error("Error loading replies:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to load replies", details: fetchError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!replies || replies.length === 0) {
      return new Response(
        JSON.stringify({ error: "No replies found for provided IDs" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2) Classify each reply via OpenAI
    const results: {
      reply_id: string;
      workspace_id: string;
      intent: Intent | null;
      confidence: number | null;
      raw: any;
    }[] = [];

    for (const reply of replies as ReplyRecord[]) {
      const prompt = buildClassificationPrompt(reply);

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an assistant that classifies email replies for a roofing contractor's sales pipeline. " +
                "You must respond ONLY with valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          console.warn("No content in OpenAI response for reply", reply.id);
          results.push({
            reply_id: reply.id,
            workspace_id: reply.workspace_id,
            intent: null,
            confidence: null,
            raw: null,
          });
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          console.error("Failed to parse JSON from OpenAI for reply", reply.id, err);
          results.push({
            reply_id: reply.id,
            workspace_id: reply.workspace_id,
            intent: null,
            confidence: null,
            raw: content,
          });
          continue;
        }

        const normalizedIntent = normalizeIntent(parsed.intent);
        const confidence = typeof parsed.confidence === "number" ? clamp(parsed.confidence, 0, 1) : null;

        results.push({
          reply_id: reply.id,
          workspace_id: reply.workspace_id,
          intent: normalizedIntent,
          confidence,
          raw: parsed,
        });
      } catch (err) {
        console.error("OpenAI classification error for reply", reply.id, err);
        results.push({
          reply_id: reply.id,
          workspace_id: reply.workspace_id,
          intent: null,
          confidence: null,
          raw: null,
        });
      }
    }

    // 3) Insert into reply_intents
    const rowsToInsert = results
      .filter((r) => r.intent !== null)
      .map((r) => ({
        reply_id: r.reply_id,
        workspace_id: r.workspace_id,
        intent: r.intent,
        confidence: r.confidence,
        model_version: "gpt-4o-mini-intent-v1",
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("reply_intents")
        .insert(rowsToInsert);

      if (insertError) {
        console.error("Error inserting reply_intents:", insertError);
        return new Response(
          JSON.stringify({
            error: "Failed to insert reply_intents",
            details: insertError.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 4) Refresh summary per workspace
    const workspaceIds = Array.from(
      new Set(results.map((r) => r.workspace_id).filter(Boolean))
    );

    for (const wsId of workspaceIds) {
      const { error: rpcError } = await supabaseAdmin.rpc(
        "refresh_reply_intents_summary",
        { p_workspace_id: wsId }
      );

      if (rpcError) {
        console.error(
          "Error refreshing reply_intents_summary for workspace",
          wsId,
          rpcError
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        classified: rowsToInsert.length,
        total_requested: body.reply_ids.length,
        workspace_ids: workspaceIds,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error in reply-intent-classifier:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// === Helpers ===================================================

function buildClassificationPrompt(reply: ReplyRecord): string {
  const nameLine = reply.from_name || reply.from_email || "Unknown sender";
  const subjectLine = reply.subject || "(no subject)";
  const preview = reply.preview || "(no preview text available)";
  const received = reply.received_at || "(unknown time)";

  return `
You are classifying an email reply for a roofing contractor who sends cold emails to homeowners.

Classify the reply into EXACTLY ONE of these buckets:

1. "hot"           = The homeowner is clearly interested in booking an estimate, asking for a quote, wants to talk soon, or wants help with a roof project.

2. "warm"          = The homeowner is somewhat interested, has questions, may be a future opportunity, or is open but not committing yet.

3. "not_interested" = They are clearly not interested, say stop emailing, or the reply is irrelevant / wrong person.

You MUST respond with JSON like:

{
  "intent": "hot" | "warm" | "not_interested",
  "confidence": 0.0 - 1.0,
  "reason": "short explanation in 1-2 sentences"
}

Here is the reply meta and content:

From: ${nameLine}
Subject: ${subjectLine}
Received: ${received}

Reply text (preview or snippet):

${preview}
`.trim();
}

function normalizeIntent(raw: any): Intent | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.toLowerCase().trim();

  if (value === "hot" || value === "hot_lead" || value === "hot lead") {
    return "hot";
  }
  if (value === "warm" || value === "warm_lead" || value === "warm lead") {
    return "warm";
  }
  if (
    value === "not_interested" ||
    value === "not interested" ||
    value === "no" ||
    value === "cold"
  ) {
    return "not_interested";
  }

  return null;
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}
