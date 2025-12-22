import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templateId = params.id;

    // Get template details
    const { data: template, error: templateError } = await supabase
      .from("marketplace_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check access for paid templates
    if (template.is_paid) {
      const { data: entitlement } = await supabase
        .from("marketplace_entitlements")
        .select("id")
        .eq("user_id", user.id)
        .eq("template_id", templateId)
        .maybeSingle();
      
      if (!entitlement) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Create JSON response
    const templateData = {
      id: template.id,
      name: template.name,
      description: template.description,
      kind: template.kind,
      tags: template.tags,
      payload: template.payload,
      created_at: template.created_at,
      version: template.version || 1
    };

    // Return JSON file for download
    return new NextResponse(JSON.stringify(templateData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${template.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Download error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 