import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "global";

  const { data, error } = await service
    .from("suppressions")
    .select("created_at,scope,kind,value,reason,note")
    .eq("scope", scope)
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = [
    ["created_at", "scope", "kind", "value", "reason", "note"],
    ...((data ?? []).map((row: any) => [
      row.created_at,
      row.scope,
      row.kind,
      row.value,
      row.reason ?? "",
      row.note ?? "",
    ])),
  ];

  const csv = rows
    .map((r) =>
      r
        .map((x) => String(x ?? "").replace(/"/g, '""'))
        .map((x) => `"${x}"`)
        .join(",")
    )
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=suppressions.csv",
    },
  });
}






