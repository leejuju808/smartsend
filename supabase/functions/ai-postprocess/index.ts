import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Rule = {
  id: string;
  name: string;
  kind: "regex" | "keyword" | "heuristic";
  pattern: string;
  force_label: string;
};

serve(async (req) => {
  try {
    const { message_id, text, raw_label, model_version_tag, raw_confidence = 0.6 } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const s = createClient(supabaseUrl, supabaseKey);

    // fetch rules ordered
    const { data: rules, error: rulesError } = await s
      .from("ai_post_rules")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (rulesError) throw rulesError;

    // resolve model_version_id by tag (optional)
    let model_version_id: string | null = null;
    if (model_version_tag) {
      const { data: mv, error: mvError } = await s
        .from("ai_model_versions")
        .select("id")
        .eq("version_tag", model_version_tag)
        .maybeSingle();

      if (mvError) throw mvError;
      model_version_id = mv?.id ?? null;
    }

    // apply rules
    const t = (text || "").toLowerCase();
    let postLabel = raw_label as string;
    let hit: Rule | null = null;

    for (const r of rules ?? []) {
      if (r.kind === "keyword") {
        const kws = String(r.pattern)
          .toLowerCase()
          .split(",")
          .map((x: string) => x.trim())
          .filter(Boolean);
        if (kws.some((k) => t.includes(k))) {
          postLabel = r.force_label;
          hit = r as Rule;
          break;
        }
      } else if (r.kind === "regex") {
        try {
          const re = new RegExp(r.pattern, "i");
          if (re.test(text)) {
            postLabel = r.force_label;
            hit = r as Rule;
            break;
          }
        } catch {
          // ignore bad regex
        }
      } else if (r.kind === "heuristic") {
        // room for quick JS-based checks later
      }
    }

    // record adjudication
    const { error: adjudicationError } = await s.from("ai_adjudications").insert({
      message_id,
      model_version_id,
      raw_label,
      post_label: postLabel,
      decision: hit ? "rules" : "model",
      meta: { rule_id: hit?.id, rule_name: hit?.name, raw_confidence },
    });

    if (adjudicationError) throw adjudicationError;

    return new Response(
      JSON.stringify({ ok: true, label: postLabel, decided_by: hit ? "rules" : "model" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-postprocess error", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
















