import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const model = url.searchParams.get("model_version");
  const label = url.searchParams.get("label");
  const supabase = createRouteHandlerClient({ cookies });

  let query = supabase.from("ai_model_thresholds").select("*");
  if (model) {
    query = query.eq("model_version", model);
  }
  if (label) {
    query = query.eq("label", label);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.rpc("upsert_ai_threshold", {
    _model: body.model_version,
    _label: body.label,
    _t: body.threshold,
  });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
















