import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { renderSubjectAndHtml } from "@/lib/renderTemplate";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: t, error } = await supabase
    .from("templates")
    .select("id, workspace_id, subject_tpl, html_tpl, status")
    .eq("id", params.id)
    .eq("workspace_id", u.user.id)
    .single();

  if (error || !t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const vars = (body?.vars ?? {}) as Record<string, any>;

  const { subject, html, missing } = renderSubjectAndHtml(t.subject_tpl, t.html_tpl, vars);
  return NextResponse.json({ ok: true, subject, html, missing, status: t.status });
}