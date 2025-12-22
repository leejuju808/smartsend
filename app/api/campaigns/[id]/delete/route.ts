import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  // only owner/admin
  const gate = await requireRole(["owner", "admin"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}












