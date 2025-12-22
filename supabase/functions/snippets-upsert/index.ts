import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.21.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration");
}

if (!openAiKey) {
  throw new Error("Missing OpenAI API key");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: openAiKey });

type SnippetInput = {
  industry?: string | null;
  role_hint?: string | null;
  tech_stack?: string[] | null;
  region?: string | null;
  body: string;
  is_active?: boolean;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" }
      });
    }

    const payload = await req.json();
    const ownerId = payload?.owner_id;
    const snippets: SnippetInput[] = Array.isArray(payload?.snippets) ? payload.snippets : [];

    if (!ownerId || typeof ownerId !== "string" || snippets.length === 0) {
      return new Response(JSON.stringify({ error: "Missing owner_id or snippets[]" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const texts = snippets.map((snippet) => {
      if (!snippet?.body || typeof snippet.body !== "string") {
        throw new Error("Each snippet requires a body string");
      }
      return snippet.body.slice(0, 8000);
    });

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts
    });

    if (embeddingResponse.data.length !== snippets.length) {
      throw new Error("Embedding response length mismatch");
    }

    const rows = snippets.map((snippet, index) => ({
      owner_id: ownerId,
      industry: snippet.industry ?? null,
      role_hint: snippet.role_hint ?? null,
      tech_stack: Array.isArray(snippet.tech_stack) ? snippet.tech_stack : null,
      region: snippet.region ?? null,
      body: snippet.body.trim(),
      is_active: snippet.is_active ?? true,
      embedding: embeddingResponse.data[index].embedding
    }));

    const { error } = await supabase.from("personalization_snippets").insert(rows);

    if (error) {
      console.error("snippets-upsert insert error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        count: rows.length
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error) {
    console.error("snippets-upsert error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

















