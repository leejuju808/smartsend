import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

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

// GET /api/attachments/contact/[contactId] - List attachments for a contact
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
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

    // Get query params for filtering
    const searchParams = req.nextUrl.searchParams;
    const filter = searchParams.get("filter"); // 'all', 'photos', 'pdfs', 'estimates'

    // Build query
    let query = supabase
      .from("attachments")
      .select(`
        id,
        file_name,
        file_type,
        file_size,
        storage_path,
        linked_to,
        folder,
        ai_label,
        ai_tags,
        detected_damage_type,
        created_at,
        user_id,
        profiles:user_id (
          id,
          full_name,
          email
        )
      `)
      .eq("contact_id", contactId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    // Apply filters
    if (filter === "photos") {
      query = query.like("file_type", "image/%");
    } else if (filter === "pdfs") {
      query = query.eq("file_type", "application/pdf");
    } else if (filter === "estimates") {
      query = query.eq("linked_to", "estimate");
    }

    const { data: attachments, error } = await query;

    if (error) {
      console.error("Error fetching attachments:", error);
      return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
    }

    // Generate signed URLs for each attachment
    const attachmentsWithUrls = await Promise.all(
      (attachments || []).map(async (attachment: any) => {
        if (!attachment.storage_path) {
          console.warn(`Attachment ${attachment.id} missing storage_path`);
          return {
            ...attachment,
            url: null,
          };
        }
        
        const { data: urlData } = await supabase.storage
          .from("attachments")
          .createSignedUrl(attachment.storage_path, 3600);

        return {
          id: attachment.id,
          file_name: attachment.file_name,
          file_type: attachment.file_type,
          file_size: attachment.file_size,
          linked_to: attachment.linked_to,
          folder: attachment.folder,
          ai_label: attachment.ai_label,
          ai_tags: attachment.ai_tags,
          detected_damage_type: attachment.detected_damage_type,
          created_at: attachment.created_at,
          uploaded_by: attachment.profiles
            ? {
                id: attachment.profiles.id,
                name: attachment.profiles.full_name || attachment.profiles.email,
              }
            : null,
          url: urlData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({ attachments: attachmentsWithUrls });
  } catch (error: any) {
    console.error("Error listing attachments:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

