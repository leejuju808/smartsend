import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.1";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false },
  });

  const { campaign_id, email, role, invited_by } = await req.json();
  if (!campaign_id || !email || !role) {
    return json({ error: "missing fields" }, 400);
  }

  const token = uuidv4();
  const { data, error } = await supabase
    .from("campaign_invites")
    .insert({
      campaign_id,
      email: String(email).toLowerCase(),
      role,
      token,
      invited_by,
    })
    .select("id, token")
    .single();

  if (error) return json({ error: error.message }, 500);

  // TODO: send email via provider (postmark/sendgrid). For now just return token.
  return json({ ok: true, token: data.token });
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}





