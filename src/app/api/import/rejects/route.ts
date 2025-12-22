// app/api/import/rejects/route.ts
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const importId = searchParams.get("import_id");
  if (!importId) return new Response("Missing import_id", { status: 400 });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return new Response("Unauthorized", { status: 401 });

  // Verify ownership
  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .select("id,user_id,filename")
    .eq("id", importId)
    .single();

  if (impErr || !imp || imp.user_id !== auth.user.id) return new Response("Not found", { status: 404 });

  const { data: rows, error } = await supabase
    .from("import_rejects")
    .select("email,reason")
    .eq("import_id", importId);

  if (error) return new Response("Failed to load rejects", { status: 500 });

  const lines = [["email", "reason"], ...(rows || []).map((r) => [r.email ?? "", r.reason ?? ""])]
    .map((cols) =>
      cols
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");

  const fname = `rejects-${imp.filename?.replace(/\.[^./\\]+$/, "") || "import"}-${imp.id}.csv`;
  return new Response(lines, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
} 