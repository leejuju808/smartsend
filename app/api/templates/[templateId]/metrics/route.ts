import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { templateId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("v_template_version_perf")
    .select("*")
    .eq("template_id", params.templateId);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return Response.json(data ?? []);
}


