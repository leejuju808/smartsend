import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nanoid } from "https://esm.sh/nanoid@5.0.7";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if affiliate already exists
    const { data: existing } = await sb
      .from("affiliates")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate unique referral code
    const code = nanoid(8);
    const url = `https://smartsendhq.com/?ref=${code}`;

    // Insert new affiliate record
    const { data, error } = await sb
      .from("affiliates")
      .insert({ user_id: userId, referral_code: code, referral_url: url })
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

