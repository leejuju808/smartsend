import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active organization
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Fetch AI templates with their test variants
    const { data: templates, error: templatesError } = await supabase
      .from("ai_templates")
      .select(`
        id,
        name,
        version,
        body,
        performance,
        status,
        created_at,
        updated_at,
        ai_template_tests (
          id,
          variant_body,
          variant_version,
          metrics,
          winner,
          created_at
        )
      `)
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      return NextResponse.json(
        { error: "Failed to fetch templates", details: templatesError.message },
        { status: 500 }
      );
    }

    // Format the response
    const formattedTemplates = (templates || []).map((template: any) => ({
      id: template.id,
      name: template.name || `Template ${template.version}`,
      version: template.version,
      body: template.body,
      performance: template.performance || {},
      status: template.status,
      created_at: template.created_at,
      updated_at: template.updated_at,
      variants: (template.ai_template_tests || []).map((variant: any) => ({
        id: variant.id,
        variant_body: variant.variant_body,
        variant_version: variant.variant_version,
        metrics: variant.metrics || {},
        winner: variant.winner,
        created_at: variant.created_at,
      })),
    }));

    return NextResponse.json({ templates: formattedTemplates });
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

