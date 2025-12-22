import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createServerComponentClient({ cookies });
  const { t } = await req.json();
  const { data, error } = await supabase.rpc("accept_campaign_invite", { p_token: t });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true, result: data }),
    { headers: { "content-type": "application/json" } }
  );
}


