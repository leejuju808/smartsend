import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("email_imports")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", u.user.id)
    .single();

  if (error || !data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}