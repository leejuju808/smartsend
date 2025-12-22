import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TrainingExample = {
  example_id: string;
  created_at: string;
  label: string;
  subject: string;
  text: string;
};

function toCSV(rows: TrainingExample[]): string {
  if (!rows.length) return "example_id,created_at,label,subject,text\n";
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const header = ["example_id", "created_at", "label", "subject", "text"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.example_id,
        r.created_at,
        r.label,
        r.subject,
        r.text,
      ].map(esc).join(","),
    );
  }
  return lines.join("\n");
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const fmt = url.searchParams.get("fmt") ?? "csv"; // csv | json

  const { data, error } = await supabase.from("v_reply_training_examples")
    .select("*")
    .limit(50000);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = (data ?? []) as TrainingExample[];
  const body = fmt === "json" ? JSON.stringify(rows) : toCSV(rows);
  const ext = fmt === "json" ? "json" : "csv";
  const key = `exports/training_${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("ml-exports")
    .upload(key, new Blob([body]), {
      contentType: fmt === "json" ? "application/json" : "text/csv",
      upsert: true,
    });

  if (uploadError) {
    return new Response(uploadError.message, { status: 500 });
  }

  const { data: pub } = await supabase.storage.from("ml-exports").getPublicUrl(
    key,
  );

  if (!pub?.publicUrl) {
    return new Response("Failed to generate public URL", { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, url: pub.publicUrl }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});

