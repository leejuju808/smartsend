/**
 * Block 13400 — Batch Enrichment API
 * 
 * Internal API endpoint for batch enrichment jobs
 * Called by the edge function cron job
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { enrichAndSave, EnrichmentContext } from "@/lib/contact-enrichment-service";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  // Verify this is an internal request (from edge function)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const body = await req.json().catch(() => ({}));
  const { contact_id, workspace_id } = body;

  if (!contact_id || !workspace_id) {
    return NextResponse.json(
      { error: "contact_id and workspace_id are required" },
      { status: 400 }
    );
  }

  try {
    // Get contact data
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, first_name, last_name, city, postal_code, state, tags")
      .eq("id", contact_id)
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
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const serviceArea = workspaceProfile?.service_areas || [];

    const context: EnrichmentContext = {
      email: contact.email,
      existingFirstName: contact.first_name || undefined,
      existingLastName: contact.last_name || undefined,
      existingCity: contact.city || undefined,
      existingZip: contact.postal_code || undefined,
      existingState: contact.state || undefined,
      existingTags: Array.isArray(contact.tags) ? contact.tags : [],
      workspaceId: workspace_id,
      serviceArea: serviceArea
    };

    await enrichAndSave(contact_id, context, supabase);

    return NextResponse.json({
      ok: true,
      contact_id,
    });
  } catch (error: any) {
    console.error("Batch enrichment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enrich contact" },
      { status: 500 }
    );
  }
}





















































