import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const model = url.searchParams.get("model_version");
  const supabase = createRouteHandlerClient({ cookies });

  let query = supabase.from("ai_eval_confusion").select("*");
  if (model) {
    query = query.eq("model_version", model);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data);
}
















