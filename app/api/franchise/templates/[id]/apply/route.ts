import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/franchise/templates/[id]/apply - Apply franchise template to branch
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is HQ owner
    const { data: hqCheck } = await supabase
      .from('branch_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'hq_owner')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!hqCheck) {
      return NextResponse.json(
        { error: "Only HQ owners can apply franchise templates" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { branch_id } = body;

    if (!branch_id) {
      return NextResponse.json(
        { error: "branch_id is required" },
        { status: 400 }
      );
    }

    // Apply template using database function
    const { data: applicationId, error: applyError } = await supabase
      .rpc('apply_franchise_template', {
        p_template_id: templateId,
        p_branch_id: branch_id,
        p_applied_by_user_id: user.id
      });

    if (applyError) {
      console.error("Error applying franchise template:", applyError);
      return NextResponse.json({ error: applyError.message }, { status: 500 });
    }

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('franchise_template_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError) {
      console.error("Error fetching application:", appError);
    }

    return NextResponse.json({
      success: true,
      application: application || { id: applicationId }
    });
  } catch (error: any) {
    console.error("Error in POST /api/franchise/templates/[id]/apply:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















