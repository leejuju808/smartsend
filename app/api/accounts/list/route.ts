import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ConnectedAccountRow = {
  id: string;
  provider: string | null;
  email: string | null;
  meta: { display_name?: string } | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;

  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, meta")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const accounts = (data ?? []).map((row: ConnectedAccountRow) => ({
    id: row.id,
    provider: row.provider ?? "",
    label: row.email || row.meta?.display_name || row.id,
  }));

  return NextResponse.json({ accounts });
}




