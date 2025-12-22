import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { name, notes } = await req.json();
  if (!name || typeof name !== "string") {
    return Response.json({ error: "name required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("ensure_eval_set", { _name: name, _notes: notes ?? null });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ id: data, name });
}
















