import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { logContactActivity } from "@/lib/contactActivity";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// POST /api/attachments/upload - Upload a file attachment
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check user has upload permission (owner, manager, staff)
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "manager", "staff"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const contactId = formData.get("contactId") as string;
    const linkedTo = formData.get("linkedTo") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!contactId) {
      return NextResponse.json({ error: "No contactId provided" }, { status: 400 });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    // Check storage limit
    const { data: org } = await supabase
      .from("organizations")
      .select("storage_used, plan_tier")
      .eq("id", orgId)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const storageLimit = org.plan_tier === "starter" ? 1073741824 : // 1GB
                        org.plan_tier === "growth" ? 5368709120 : // 5GB
                        org.plan_tier === "domination" ? 21474836480 : // 20GB
                        1073741824; // default 1GB

    if ((org.storage_used || 0) + file.size > storageLimit) {
      return NextResponse.json(
        { 
          error: "Storage limit exceeded",
          storageUsed: org.storage_used || 0,
          storageLimit,
          planTier: org.plan_tier || "starter"
        },
        { status: 403 }
      );
    }

    // Verify contact belongs to org
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, org_id")
      .eq("id", contactId)
      .single();

    if (!contact || contact.org_id !== orgId) {
      return NextResponse.json({ error: "Contact not found or access denied" }, { status: 404 });
    }

    // Generate storage path: attachments/{org_id}/{contact_id}/{uuid}-{filename}
    const fileId = crypto.randomUUID();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `${orgId}/${contactId}/${fileId}-${sanitizedFileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Create attachment record
    const { data: attachment, error: insertError } = await supabase
      .from("attachments")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        user_id: user.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        linked_to: linkedTo || null,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from("attachments").remove([storagePath]);
      console.error("Attachment insert error:", insertError);
      return NextResponse.json({ error: "Failed to create attachment record" }, { status: 500 });
    }

    // Get signed URL for download
    const { data: urlData } = await supabase.storage
      .from("attachments")
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    // Determine activity type based on file type
    let activityType = "note_added";
    let activityTitle = `File uploaded: ${file.name}`;
    
    if (file.type.startsWith("image/")) {
      activityType = "photo_uploaded";
      activityTitle = `Photo uploaded: ${file.name}`;
    } else if (file.type === "application/pdf") {
      activityType = "document_uploaded";
      activityTitle = `Document uploaded: ${file.name}`;
    }

    // Log activity to v2 activity_events table (existing)
    await logContactActivity({
      orgId,
      contactId,
      type: activityType,
      title: activityTitle + (linkedTo ? ` (${linkedTo})` : ""),
      description: file.type.startsWith("image/") 
        ? `Photo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
        : file.type === "application/pdf"
        ? `PDF document: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
        : `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      userId: user.id,
      meta: {
        attachment_id: attachment.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        linked_to: linkedTo,
        event_type: "file_uploaded",
        is_photo: file.type.startsWith("image/"),
        is_pdf: file.type === "application/pdf",
      },
    });

    // Log activity to v3 contact_activity table (Block 13500)
    const { logFileUploadV3 } = await import("@/lib/contactActivityV3");
    await logFileUploadV3(contactId, {
      fileName: file.name,
      fileSize: file.size,
      createdBy: user.id,
    });

    // Trigger AI analysis in the background (don't wait for it)
    // Use absolute URL or relative URL based on environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    
    if (file.type.startsWith("image/")) {
      // Trigger comprehensive Photo Intelligence v1 analysis (Block 18500)
      fetch(`${baseUrl}/api/photo/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          contactId: contactId,
          attachmentId: attachment.id 
        }),
      }).catch((err) => {
        console.error("Error triggering photo intelligence analysis:", err);
      });
      
      // Also trigger legacy photo analysis for backward compatibility
      fetch(`${baseUrl}/api/files/analyze-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment.id }),
      }).catch((err) => {
        console.error("Error triggering legacy photo analysis:", err);
      });
    } else if (file.type === "application/pdf") {
      // Trigger PDF analysis asynchronously
      fetch(`${baseUrl}/api/files/analyze-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment.id }),
      }).catch((err) => {
        console.error("Error triggering PDF analysis:", err);
      });
    }

    return NextResponse.json({
      id: attachment.id,
      file_name: attachment.file_name,
      file_type: attachment.file_type,
      file_size: attachment.file_size,
      linked_to: attachment.linked_to,
      created_at: attachment.created_at,
      url: urlData?.signedUrl || null,
    });
  } catch (error: any) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

