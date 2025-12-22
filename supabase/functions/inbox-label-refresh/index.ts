import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, last_intent, last_intent_confidence")
    .limit(500);

  if (error) {
    return new Response(
      JSON.stringify({ updated: 0, error: error.message }),
      { status: 500 },
    );
  }

  const payload =
    threads?.filter((t) => Boolean(t.last_intent)).map((t) => ({
      thread_id: t.id,
      label: t.last_intent,
      confidence: t.last_intent_confidence ?? 0.8,
    })) ?? [];

  if (payload.length) {
    const { error: upsertError } = await supabase
      .from("thread_labels")
      .upsert(payload, {
        onConflict: "thread_id,label",
      } as any);

    if (upsertError) {
      return new Response(
        JSON.stringify({ updated: 0, error: upsertError.message }),
        { status: 500 },
      );
    }
  }

  return new Response(JSON.stringify({ updated: payload.length }), {
    status: 200,
  });
});


