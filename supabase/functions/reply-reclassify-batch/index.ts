import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const functionsEndpoint = `${supabaseUrl}/functions/v1/reply-classify-v2`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const campaignId = body?.campaign_id as string | undefined;
    const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 200;

    if (!campaignId) {
      return new Response("Missing campaign_id", { status: 400 });
    }

    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: messages, error } = await sb
      .from("inbox_messages")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, Math.max(1, limit)));

    if (error) {
      return new Response(error.message, { status: 400 });
    }

    let processed = 0;
    for (const msg of messages ?? []) {
      try {
        const response = await fetch(functionsEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: auth,
            apikey: anonKey,
          },
          body: JSON.stringify({ message_id: msg.id }),
        });
        if (response.ok) {
          processed += 1;
        } else {
          console.error("Reclassify call failed", msg.id, await response.text());
        }
      } catch (err) {
        console.error("Failed to reclassify message", msg.id, err);
      }
    }

    return new Response(
      JSON.stringify({ processed }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    console.error("reply-reclassify-batch error", error);
    return new Response("Internal Error", { status: 500 });
  }
});

