import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve({
  "/": async (req: Request) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Missing auth", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response("Invalid auth", { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("due_date", today)
      .eq("status", "pending")
      .order("priority", { ascending: false });

    if (error) {
      return new Response(JSON.stringify(error), { status: 400 });
    }

    return new Response(JSON.stringify({ tasks }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});














































