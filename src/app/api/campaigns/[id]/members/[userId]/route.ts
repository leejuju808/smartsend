import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { role } = await req.json();
  const { error } = await supabase.rpc("set_campaign_member_role", {
    p_campaign: params.id,
    p_user: params.userId,
    p_role: role
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { "content-type": "application/json" } }
  );
}

export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { error } = await supabase.rpc("remove_campaign_member", {
    p_campaign: params.id,
    p_user: params.userId
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { "content-type": "application/json" } }
  );
}


