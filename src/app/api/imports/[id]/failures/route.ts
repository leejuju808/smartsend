import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json("Unauthorized", { status: 401 });

  const { data: imp, error: iErr } = await supabase
    .from("email_imports").select("id,workspace_id").eq("id", params.id).single();
  if (iErr || !imp || imp.workspace_id !== u.user.id) return NextResponse.json("Not found", { status: 404 });

  const { data: rows } = await supabase
    .from("email_import_failures")
    .select("row_number,to_email,subject,vars,error")
    .eq("import_id", params.id)
    .order("row_number", { ascending: true });

  const header = "row_number,to,subject,vars,error\n";
  const body = (rows ?? []).map(r => {
    const esc = (s: string) => `"${String(s ?? "").replaceAll('"','""')}"`;
    return [r.row_number, r.to_email ?? "", r.subject ?? "", JSON.stringify(r.vars ?? {}), r.error].map(esc).join(",");
  }).join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="failures_${params.id}.csv"`
    }
  });
}