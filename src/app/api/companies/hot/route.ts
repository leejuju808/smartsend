import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET() {
  const gate = await requireRole(["owner", "admin", "member", "viewer"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return NextResponse.json({ error: "no org" }, { status: 401 });
  }

  // Get companies with intent_score >= 5 (Hot Accounts threshold)
  const { data: companies, error } = await supabase
    .from("companies")
    .select(
      `
      *,
      leads(count)
    `
    )
    .eq("org_id", orgId)
    .gte("intent_score", 5) // Hot Accounts threshold
    .order("intent_score", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Transform to include leads_count
  const companiesWithCounts = (companies || []).map((c: any) => ({
    ...c,
    leads_count: c.leads?.[0]?.count || 0,
    is_hot: c.intent_score >= 5,
  }));

  return NextResponse.json({ companies: companiesWithCounts });
}












