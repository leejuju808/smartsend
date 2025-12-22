import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const { companyId } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "no org" }, { status: 401 });
  }

  // Fetch company
  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .eq("org_id", orgId)
    .single();

  if (fetchError || !company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // --- PLUG YOUR ENRICHMENT SOURCE HERE ---
  const techStack = await fakeTechStack(company.domain); // placeholder

  const { error: updateError } = await supabase
    .from("companies")
    .update({ tech_stack: techStack })
    .eq("id", companyId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, tech_stack: techStack });
}

// temporary fake function
async function fakeTechStack(domain: string): Promise<string[]> {
  // TODO: Replace with actual enrichment API (Clearbit, PeopleDataLabs, Apollo, Clay, BuiltWith, Wappalyzer, etc.)
  return ["AWS", "React", "Stripe"];
}












