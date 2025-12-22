import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as toCSV } from "https://deno.land/std@0.168.0/csv/mod.ts";

type Row = { id: string; text: string; label: string; weight: number; split: string };

serve(async (req) => {
  try {
    const {
      target_model_version,
      split = { train: 0.8, eval: 0.2, holdout: 0.0 },
      seed = 42,
    } = await req.json();

    if (!target_model_version) {
      throw new Error("target_model_version is required");
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);

    // 1) Register/ensure model row exists
    await supabase.rpc("ensure_model_row", { _mv: target_model_version }).catch(() => {});

    // 2) Pull labeled samples
    const { data: samples, error: samplesError } = await supabase
      .from("ai_training_samples")
      .select("id,text,label,weight,split,locked")
      .not("label", "is", null);
    if (samplesError) throw samplesError;

    // 3) Boost weights for mined hard cases
    const { data: hard } = await supabase.from("ai_hard_negatives").select("sample_id");
    const hardSet = new Set((hard || []).map((h: any) => h.sample_id));
    const rows: Row[] = (samples || []).map((s: any) => ({
      id: s.id,
      text: s.text,
      label: s.label,
      weight: hardSet.has(s.id) ? Math.max(Number(s.weight || 1), 2.0) : Number(s.weight || 1),
      split: s.split,
    }));

    // 4) Assign splits if 'auto' — deterministic via seed hash
    function hash(str: string) {
      let h = seed;
      for (let i = 0; i < str.length; i++) {
        h = (h << 5) - h + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }
    const ratioTrain = split.train ?? 0.8;
    const ratioEval = split.eval ?? 0.2;
    rows.forEach((r) => {
      if (r.split === "auto") {
        const h = hash(r.id) % 10000;
        const p = h / 10000;
        r.split = p < ratioTrain ? "train" : p < ratioTrain + ratioEval ? "eval" : "holdout";
      }
    });

    // 5) Produce CSV
    const csvRecords = rows.map((r) => ({
      id: r.id,
      text: r.text,
      label: r.label,
      weight: r.weight,
      split: r.split,
    }));
    const csv = await toCSV(csvRecords, { columns: ["id", "text", "label", "weight", "split"] });

    // 6) Upload to Storage
    const path = `datasets/${target_model_version}/dataset_${Date.now()}.csv`;
    const { error: uploadError } = await supabase.storage
      .from("ai-datasets")
      .upload(path, new Blob([csv], { type: "text/csv" }), { upsert: true });
    if (uploadError) throw uploadError;

    // 7) Enqueue job
    const { error: jobError } = await supabase.from("ai_training_jobs").insert({
      target_model_version,
      dataset_uri: `ai-datasets/${path}`,
      status: "queued",
      params: { split, seed },
    });
    if (jobError) throw jobError;

    // 8) Mark model pending -> queued (still pending until training)
    await supabase.from("ai_model_registry").update({ status: "pending" }).eq("model_version", target_model_version);

    return new Response(JSON.stringify({ ok: true, dataset_uri: `ai-datasets/${path}` }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400 });
  }
});
















