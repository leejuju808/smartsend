// Block 25140 — SmartSend Roofing Homeowner Experience v1
// API endpoint for updating trust-building features (identity verification, cleanup, warranty)

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspaceId,
      jobId,
      contactId,
      projectManagerName,
      projectManagerPhotoUrl,
      crewContactName,
      crewContactPhone,
      cleanupVerified,
      cleanupIssuesReported,
      warrantyDocumentUrl,
      finalPhotoUrls,
      reviewLinksProvided,
    } = body;

    // Validate required fields
    if (!workspaceId || !jobId || !contactId) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, jobId, contactId" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: owner } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!member && !owner) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get or create trust features record
    const { data: existing } = await supabase
      .from("homeowner_trust_features")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    const updateData: any = {
      workspace_id: workspaceId,
      job_id: jobId,
      contact_id: contactId,
    };

    if (projectManagerName !== undefined) {
      updateData.project_manager_name = projectManagerName;
      updateData.identity_shared_at = new Date().toISOString();
    }
    if (projectManagerPhotoUrl !== undefined) {
      updateData.project_manager_photo_url = projectManagerPhotoUrl;
    }
    if (crewContactName !== undefined) {
      updateData.crew_contact_name = crewContactName;
    }
    if (crewContactPhone !== undefined) {
      updateData.crew_contact_phone = crewContactPhone;
    }
    if (cleanupVerified !== undefined) {
      updateData.cleanup_verified = cleanupVerified;
      updateData.cleanup_verified_at = cleanupVerified
        ? new Date().toISOString()
        : null;
    }
    if (cleanupIssuesReported !== undefined) {
      updateData.cleanup_issues_reported = cleanupIssuesReported;
    }
    if (warrantyDocumentUrl !== undefined) {
      updateData.warranty_document_url = warrantyDocumentUrl;
      updateData.warranty_delivered_at = new Date().toISOString();
    }
    if (finalPhotoUrls !== undefined) {
      updateData.final_photo_urls = finalPhotoUrls;
      updateData.final_photos_sent_at = new Date().toISOString();
    }
    if (reviewLinksProvided !== undefined) {
      updateData.review_links_provided = reviewLinksProvided;
      updateData.review_request_sent_at = new Date().toISOString();
    }

    let result;
    if (existing) {
      result = await supabase
        .from("homeowner_trust_features")
        .update(updateData)
        .eq("id", existing.id)
        .select("id")
        .single();
    } else {
      result = await supabase
        .from("homeowner_trust_features")
        .insert(updateData)
        .select("id")
        .single();
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: result.data?.id });
  } catch (error: any) {
    console.error("Error updating trust features:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

