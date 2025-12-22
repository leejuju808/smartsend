import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  _req: Request,
  { params }: { params: { templateId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: template, error } = await supabase
    .from("followup_templates")
    .select("id, campaign_id, step_number, subject, body, tone")
    .eq("id", params.templateId)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

















