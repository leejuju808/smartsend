import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parse } from "jsr:@std/csv/parse";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const user_id = form.get("user_id") as string | null;

  if (!file || !user_id) {
    return new Response("Missing file/user", { status: 400 });
  }

  const text = await file.text();
  const records = [...parse(text, { skipFirstRow: false })];
  const headers = (records.shift() as string[] | undefined) ?? [];
  const rows = records.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), r[i]]))
  );
  const sample = rows.slice(0, 5);

  const sb = createClient(SB_URL, SRK, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("lead_import_staging")
    .insert({
      user_id,
      filename: file.name,
      headers,
      rows,
      preview: sample,
    })
    .select("id, headers, preview")
    .single();

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
});





