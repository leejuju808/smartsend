import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type ImportRow = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  custom1?: string;
  custom2?: string;
  custom3?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify campaign access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { rows } = (await req.json()) as { rows: ImportRow[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows (array) required" }, { status: 400 });
  }

  // (Optional) quick server-side validation: cap at 25k rows
  if (rows.length > 25000) {
    return NextResponse.json({ error: "Too many rows (25k max per import)" }, { status: 400 });
  }

  // Normalize known fields server-side too
  const normalized = rows.map((r) => ({
    email: (r.email || "").trim(),
    first_name: r.first_name?.trim() || null,
    last_name: r.last_name?.trim() || null,
    company: r.company?.trim() || null,
    phone: r.phone?.trim() || null,
    custom1: r.custom1?.trim() || null,
    custom2: r.custom2?.trim() || null,
    custom3: r.custom3?.trim() || null,
  }));

  const { data, error } = await supabase.rpc("import_leads_json", {
    p_campaign: params.id,
    p_rows: normalized,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ summary: data });
}

