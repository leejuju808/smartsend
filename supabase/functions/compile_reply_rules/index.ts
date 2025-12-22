import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RuleRow = {
  scope: "global" | "campaign";
  campaign_id?: string | null;
  label: string;
  kind: "subject_regex" | "text_regex" | "header_key" | "header_value_regex";
  pattern: string;
  weight: number;
};

type RuleRecord = RuleRow & { is_active: boolean };

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await supabase.from("reply_rules")
    .select("scope,campaign_id,label,kind,pattern,weight,is_active")
    .eq("is_active", true);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rules = ((rows ?? []) as RuleRecord[]).map((r) => {
    const ok = (() => {
      try {
        if (r.kind.endsWith("_regex")) {
          new RegExp(r.pattern, "i");
        }
        return true;
      } catch {
        return false;
      }
    })();

    return { ...r, ok };
  }).filter((r) => r.ok)
    .map(({ ok, is_active, ...rest }) => rest);

  const json = JSON.stringify({ version: Date.now(), rules }, null, 0);

  const key = "rules/reply_rules.json";
  const { error: uploadError } = await supabase.storage.from("ml-exports")
    .upload(key, new Blob([json]), {
      contentType: "application/json",
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

