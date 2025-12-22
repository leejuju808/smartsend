import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { enrichAndSave, EnrichmentContext } from "@/lib/contact-enrichment-service";

/**
 * POST /api/contacts/enrich
 * Block 13400: Enriches a single contact with city, zip, neighborhood, name, property type, and insurance interest
 * 
 * Body: {
 *   contact_id: string (uuid),
 *   address?: string,
 *   zip_code?: string
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { contact_id, address, zip_code } = body;

  if (!contact_id) {
    return NextResponse.json(
      { error: "contact_id is required" },
      { status: 400 }
    );
  }

  // Verify contact exists and belongs to workspace
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, workspace_id, email, first_name, last_name, city, postal_code, state, tags")
    .eq("id", contact_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  // Get workspace service area
  const { data: workspaceProfile } = await supabase
    .from("workspace_profile")
    .select("service_areas")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const serviceArea = workspaceProfile?.service_areas || [];

  // Use provided address/zip or contact's existing data
  const enrichAddress = address || contact.address;
  const enrichZip = zip_code || contact.postal_code || contact.zip;

  try {
    // Block 13400: Use new enrichment service
    const context: EnrichmentContext = {
      email: contact.email,
      existingFirstName: contact.first_name || undefined,
      existingLastName: contact.last_name || undefined,
      existingCity: contact.city || undefined,
      existingZip: enrichZip || undefined,
      existingState: contact.state || undefined,
      existingTags: Array.isArray(contact.tags) ? contact.tags : [],
      workspaceId: workspaceId,
      serviceArea: serviceArea
    };

    await enrichAndSave(contact_id, context, supabase);

    // Get updated enrichment data
    const { data: enrichment } = await supabase
      .from("contact_enrichment")
      .select("*")
      .eq("contact_id", contact_id)
      .single();

    return NextResponse.json({
      ok: true,
      contact_id,
      enrichment: enrichment,
    });
  } catch (error: any) {
    console.error("Enrichment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enrich contact" },
      { status: 500 }
    );
  }
}








