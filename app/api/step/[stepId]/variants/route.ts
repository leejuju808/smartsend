import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { stepId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("step_variants")
    .select("id,created_at,updated_at,name,weight,subject,body,is_html,active,step_id,notes")
    .eq("step_id", params.stepId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

