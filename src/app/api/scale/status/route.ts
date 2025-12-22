import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Resolve the current roofing company by workspace (canonical mapping)
    const { data: company, error: companyErr } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }

    if (!company?.id) {
      // Conservative default: locked until a company exists
      return NextResponse.json({
        company_id: null,
        scale_score: 0,
        tier: "locked",
        computed_at: new Date().toISOString(),
        factors: [],
        blockers: [
          {
            key: "no_company",
            label: "No company linked to this workspace",
            value: null,
          },
        ],
      });
    }

    const { data, error } = await supabase.rpc("compute_scale_readiness", {
      p_company_id: company.id,
      p_persist: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(row ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}









