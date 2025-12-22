import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function DELETE(_: Request, { params }: { params: { id: string; inviteId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.from("campaign_invites").delete().eq("id", params.inviteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



