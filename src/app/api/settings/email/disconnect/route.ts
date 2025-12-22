import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const form = await req.formData();
  const provider = String(form.get("provider") || "gmail");
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("user_connections").delete().eq("user_id", user.id).eq("provider", provider);
  }
  return NextResponse.redirect("/settings/email");
}

