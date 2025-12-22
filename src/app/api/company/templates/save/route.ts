// POST /api/company/templates/save
// Save a template for a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { roofing_company_id, template_type, name, content, variables, is_default, template_id } = body;

    if (!roofing_company_id || !template_type || !name || !content) {
      return NextResponse.json(
        { error: "roofing_company_id, template_type, name, and content are required" },
        { status: 400 }
      );
    }

    // Validate template_type
    const validTypes = ['estimate', 'proposal', 'contract', 'email', 'sms', 'change_order', 'invoice', 'warranty'];
    if (!validTypes.includes(template_type)) {
      return NextResponse.json(
        { error: "Invalid template_type. Must be one of: " + validTypes.join(", ") },
        { status: 400 }
      );
    }

    // Check if user is a member
    const { data: member } = await supabase
      .from("roofing_company_members")
      .select("id")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // If setting as default, unset other defaults of same type
    if (is_default) {
      await supabase
        .from("templates")
        .update({ is_default: false })
        .eq("roofing_company_id", roofing_company_id)
        .eq("template_type", template_type)
        .neq("id", template_id || "00000000-0000-0000-0000-000000000000");
    }

    // Save template
    const templateData: any = {
      roofing_company_id,
      template_type,
      name,
      content,
      variables: variables || [],
      is_default: is_default || false,
      is_active: true,
      created_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (template_id) {
      // Update existing
      const { data, error } = await supabase
        .from("templates")
        .update(templateData)
        .eq("id", template_id)
        .eq("roofing_company_id", roofing_company_id)
        .select()
        .single();

      if (error) {
        console.error("Error updating template:", error);
        return NextResponse.json(
          { error: "Failed to update template" },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("templates")
        .insert(templateData)
        .select()
        .single();

      if (error) {
        console.error("Error creating template:", error);
        return NextResponse.json(
          { error: "Failed to create template" },
          { status: 500 }
        );
      }
      result = data;
    }

    return NextResponse.json({
      success: true,
      template: result,
    });
  } catch (error: any) {
    console.error("Error saving template:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























