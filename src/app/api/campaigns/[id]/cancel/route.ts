import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.from("campaigns").update({ status: "canceled" }).eq("id", params.id);
  return NextResponse.json({ ok: true });
}

