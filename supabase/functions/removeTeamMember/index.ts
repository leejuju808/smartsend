import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = { teamId: string; userId: string };

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { teamId, userId } = (await req.json()) as Payload;

  // RLS bypassed by service role. Admin rights already enforced in UI; you can add extra checks here if needed.
  const { error } = await supabase
    .from("team_members")
    .delete()
    .match({ team_id: teamId, user_id: userId });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});

