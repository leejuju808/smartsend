import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: user } = await supabase.auth.getUser(jwt);
    if (!user?.user) return json({ error: "unauthorized" }, 401);

    const { campaign_id, email, role = "viewer" } = await req.json();

    // verify caller is owner/editor on this campaign
    const { data: allowed, error: aErr } = await supabase
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user.user.id)
      .maybeSingle();
    if (aErr || !allowed || !["owner","editor"].includes((allowed as any).role)) {
      return json({ error: "forbidden" }, 403);
    }

    const { data, error } = await supabase
      .from("campaign_invites")
      .insert({ campaign_id, email: String(email).toLowerCase(), role, created_by: user.user.id })
      .select("token")
      .maybeSingle();
    if (error) throw error;

    const inviteUrl = `${Deno.env.get("PUBLIC_APP_URL")}/accept-invite?token=${(data as any)!.token}`;
    return json({ ok: true, invite_url: inviteUrl });
  } catch (e: any) {
    return json({ error: e.message || "server_error" }, 500);
  }
});

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}


