import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/campaign-templates
 * Get all campaign templates
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.current_org_id;

    // Block 269900: Load last month's carry to auto-pick default.
    // If we have a best template, we return it first and mark it is_default (no review required).
    let bestTemplateId: string | null = null;
    let worstTemplateId: string | null = null;
    try {
      if (orgId) {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const lastMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
        const monthStr = lastMonthStart.toISOString().slice(0, 10);

        const { data: carry } = await supabase
          .from("ss_template_monthly_carry")
          .select("best_template_id, worst_template_id")
          .eq("org_id", orgId)
          .eq("month", monthStr)
          .eq("niche", "roofing")
          .maybeSingle();

        bestTemplateId = (carry as any)?.best_template_id ?? null;
        worstTemplateId = (carry as any)?.worst_template_id ?? null;
      }
    } catch {
      // best-effort
    }

    // Fetch templates (global + org-specific)
    const { data: templates, error } = await supabase
      .from("campaign_templates")
      .select(`
        *,
        category:template_categories(*)
      `)
      .or(`is_global.eq.true${orgId ? `,org_id.eq.${orgId}` : ""}`)
      // Return all active roofing templates (Block 273300: Market Immunity templates ship alongside Storm Check)
      .eq("niche", "roofing")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    // Get step counts for each template
    const templatesWithSteps = await Promise.all(
      (templates || []).map(async (template) => {
        const { count } = await supabase
          .from("campaign_template_steps")
          .select("*", { count: "exact", head: true })
          .eq("template_id", template.id);

        return {
          ...template,
          step_count: count || 0,
          is_default: bestTemplateId ? String(template.id) === String(bestTemplateId) : false,
          is_demoted: worstTemplateId ? String(template.id) === String(worstTemplateId) : false,
        };
      })
    );

    // Put the best-performing template first (auto-default).
    if (bestTemplateId) {
      templatesWithSteps.sort((a: any, b: any) => {
        const aIs = String(a.id) === String(bestTemplateId);
        const bIs = String(b.id) === String(bestTemplateId);
        if (aIs && !bIs) return -1;
        if (!aIs && bIs) return 1;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    }

    return NextResponse.json({ templates: templatesWithSteps });
  } catch (error: any) {
    console.error("Templates API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
