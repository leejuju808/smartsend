import { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type BouncePayload = {
  account_id: string;
  email: string;
  provider?: string;
  reason?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const payload = (await req.json().catch(() => null)) as BouncePayload | null;

  if (!payload?.account_id || !payload.email) {
    return new Response("invalid_payload", { status: 400 });
  }

  const { error } = await supabase.from("account_suppressions").upsert(
    {
      account_id: payload.account_id,
      email: payload.email,
      reason: "bounce",
    },
    { onConflict: "account_id,email" },
  );

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json({ ok: true });
}


