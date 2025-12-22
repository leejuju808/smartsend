import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  try {
    const { teamId, type } = await req.json(); // type = "lead" | "send" | "seat"

    if (!teamId || !type) {
      return new Response(
        JSON.stringify({ error: "Missing teamId or type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: team, error: teamError } = await sb
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return new Response(
        JSON.stringify({ error: "Team not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: lim, error: limitError } = await sb
      .from("plan_limits")
      .select("*")
      .eq("plan", team.plan || "free")
      .single();

    if (limitError || !lim) {
      // If no limit found, default to free plan limits
      const defaultLimits = { max_leads: 500, max_sends: 200, max_seats: 1 };
      let over = false;
      
      if (type === "lead" && team.usage_leads >= defaultLimits.max_leads) over = true;
      if (type === "send" && team.usage_sends >= defaultLimits.max_sends) over = true;
      if (type === "seat" && team.usage_seats >= defaultLimits.max_seats) over = true;

      return new Response(
        JSON.stringify({ allowed: !over, limits: defaultLimits }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let over = false;

    if (type === "lead" && team.usage_leads >= lim.max_leads) over = true;
    if (type === "send" && team.usage_sends >= lim.max_sends) over = true;
    if (type === "seat" && team.usage_seats >= lim.max_seats) over = true;

    return new Response(
      JSON.stringify({ allowed: !over, limits: lim }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

