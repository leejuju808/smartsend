++ 0
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const intentId = params.id;

  const { data, error } = await supabase
    .from("meeting_intents")
    .select("ics_text, ics_uid")
    .eq("id", intentId)
    .maybeSingle();

  if (error || !data?.ics_text) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(data.ics_text, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(data.ics_uid || intentId).replace(/[^a-zA-Z0-9-_]/g, "")}.ics"`,
    },
  });
}


