import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(JSON.stringify({ error: "Missing lead" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    // Build enriched summary text for embedding
    const text = `
Lead Summary:
Name: ${lead.first_name || ""} ${lead.last_name || ""}
Company: ${lead.guessed_company || lead.company || ""}
Description: ${lead.company_description || ""}
Industry: ${lead.guessed_industry || lead.industry || ""}
Title: ${lead.guessed_title || lead.title || ""}
Tech Stack: ${Array.isArray(lead.tech_stack) ? lead.tech_stack.join(", ") : ""}
Size: ${lead.company_size || ""}
Email Domain: ${lead.email?.split("@")?.[1] || ""}
`.trim();

    // Generate embedding using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text
    });

    const vector = embeddingResponse.data[0].embedding;

    // Update lead with embedding
    // Supabase handles vector type conversion automatically when passed as array
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        embedding: vector
      })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Failed to update lead embedding:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update embedding" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  } catch (error: any) {
    console.error("embedding-lead error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

